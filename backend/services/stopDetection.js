/**
 * stopDetection.js — Automatic Stop Detection State Machine
 *
 * Core logic for determining when a bus is APPROACHING, ARRIVED at,
 * or DEPARTED from a stop. Evaluates only the next expected stop
 * for efficiency (no full-route scan on every update).
 *
 * State Transitions:
 * ┌──────────┬──────────────────────────────────────────┬──────────────┐
 * │ Current  │ Condition                                │ New State    │
 * ├──────────┼──────────────────────────────────────────┼──────────────┤
 * │ OUTSIDE  │ dist <= approach_radius_m                │ APPROACHING  │
 * │ APPROACH │ dist <= arrival_radius_m                 │ ARRIVED      │
 * │ ARRIVED  │ dist > arrival_radius_m + HYSTERESIS     │ DEPARTED     │
 * │ DEPARTED │ dist > approach_radius_m                 │ OUTSIDE      │
 * │ OUTSIDE  │ (next stop advanced after DEPARTED)      │              │
 * └──────────┴──────────────────────────────────────────┴──────────────┘
 *
 * Two-stage departure:
 * - ARRIVED → DEPARTED: fires at arrival_radius + HYSTERESIS_BUFFER_M (~70m)
 * - DEPARTED → OUTSIDE: fires at approach_radius (~500m), advances to next stop
 */

const { haversineDistance, estimateSpeed } = require('./geo');
const stopDb = require('./stopDb');

// Hysteresis buffer (meters) — once ARRIVED, bus must exceed
// arrival_radius_m + this buffer before reverting to APPROACHING.
// Prevents GPS noise from causing rapid state toggling at the boundary.
const HYSTERESIS_BUFFER_M = 20;

/**
 * Detect a stop event for the given bus at its current position.
 *
 * @param {string} busId     - Unique bus/device identifier
 * @param {number} lat       - Current latitude (degrees)
 * @param {number} lon       - Current longitude (degrees)
 * @param {number} speed     - Current speed in km/h (null if unavailable)
 * @param {number} timestamp - Current timestamp in ms since epoch
 * @returns {Promise<{ event: string, stopId: string, stopName: string, state: string, distance: number } | null>}
 *          Returns the detected event or null if no state transition occurred.
 */
const detectStopEvent = async (busId, lat, lon, speed, timestamp) => {
  try {
    // ─── 1. Fetch current bus state ────────────────────────────────────────
    let busState = await stopDb.getBusState(busId);

    if (!busState) {
      // Bus has no state yet — it needs to be assigned to a route first
      console.log(`ℹ️ [StopDetection] Bus ${busId} has no state — skipping detection.`);
      return null;
    }

    let { route_id, next_stop_id, state: currentState } = busState;

    if (!route_id || !next_stop_id) {
      console.log(`ℹ️ [StopDetection] Bus ${busId} has no route or next stop assigned.`);
      return null;
    }

    // ─── 2. Fetch the next expected stop ───────────────────────────────────
    let nextStop = await stopDb.getStop(next_stop_id);

    if (!nextStop) {
      console.log(`⚠️ [StopDetection] Next stop ${next_stop_id} not found in database.`);
      return null;
    }

    // ─── 3. Calculate distance from bus to the next stop ───────────────────
    let distance = haversineDistance(lat, lon, nextStop.latitude, nextStop.longitude);

    // ─── 4. If speed not provided by GPS, estimate from previous position ──
    let effectiveSpeed = speed;
    if (effectiveSpeed === null || effectiveSpeed === undefined || effectiveSpeed < 0) {
      if (busState.latitude && busState.longitude && busState.updated_at) {
        const prevTime = new Date(busState.updated_at).getTime();
        effectiveSpeed = estimateSpeed(
          busState.latitude, busState.longitude, prevTime,
          lat, lon, timestamp
        );
      } else {
        effectiveSpeed = 0;
      }
    }

    // ─── 3.5 Global Progress Reconciliation (Blackout Recovery) ─────────────
    // If we are far from the expected stop (definitively not approaching it)
    if (distance > nextStop.approach_radius_m + HYSTERESIS_BUFFER_M) {
      const allStops = await stopDb.getRouteStops(route_id);
      const remainingStops = allStops.filter(s => s.sequence_no > nextStop.sequence_no);
      
      let closestFutureStop = null;
      let minFutureDistance = Infinity;

      // Find the absolute closest future stop
      for (const stop of remainingStops) {
        const d = haversineDistance(lat, lon, stop.latitude, stop.longitude);
        if (d < minFutureDistance) {
          minFutureDistance = d;
          closestFutureStop = stop;
        }
      }

      // If we are definitively close to a future stop (inside its approach zone + a generous 200m buffer)
      if (closestFutureStop && minFutureDistance <= closestFutureStop.approach_radius_m + 200) {
        console.log(
          `🚀 [GlobalReconciliation] Massive GPS blackout/jump detected! ` +
          `Bus ${busId} is ${Math.round(minFutureDistance)}m from "${closestFutureStop.stop_name}" (Seq ${closestFutureStop.sequence_no}), ` +
          `but was expected at "${nextStop.stop_name}" (Seq ${nextStop.sequence_no}, ${Math.round(distance)}m away). ` +
          `Logging "${nextStop.stop_name}" as Auto-Bypassed (DEPARTED).`
        );
        
        // Instead of instantly forwarding to closestFutureStop, we process ONE bypassed stop per ping.
        // This ensures the logs, the socket events, and the history table capture it properly!
        const nowIso = new Date().toISOString();
        
        // Fetch the IMMEDIATE next stop after the bypassed one to continue the cascade
        const advancedStop = await stopDb.getNextStop(route_id, nextStop.sequence_no);
        const nextTargetId = advancedStop ? advancedStop.stop_id : next_stop_id;
        const nextTargetName = advancedStop ? advancedStop.stop_name : nextStop.stop_name;
        
        await stopDb.upsertBusState(busId, {
          route_id,
          latitude: lat,
          longitude: lon,
          speed: effectiveSpeed,
          state: 'OUTSIDE', // We set it to OUTSIDE so the next ping evaluates it cleanly for the new target
          current_stop_id: nextStop.stop_id,
          next_stop_id: nextTargetId, 
          last_event: 'DEPARTED',
          last_event_time: nowIso
        });

        return {
          event: 'DEPARTED',
          stopId: nextStop.stop_id,
          stopName: nextStop.stop_name,
          state: 'OUTSIDE',
          distance: Math.round(distance),
          speed: effectiveSpeed,
          nextStopId: nextTargetId,
          nextStopName: nextTargetName
        };
      }
    }


    // ─── 5. DIAGNOSTIC LOGGING — every GPS tick ────────────────────────────
    console.log(
      `📊 [DIAG] Bus=${busId} | GPS=(${lat.toFixed(6)}, ${lon.toFixed(6)}) | ` +
      `Stop="${nextStop.stop_name}" @ (${nextStop.latitude.toFixed(6)}, ${nextStop.longitude.toFixed(6)}) | ` +
      `Dist=${Math.round(distance)}m | ApproachR=${nextStop.approach_radius_m}m | ArrivalR=${nextStop.arrival_radius_m}m | ` +
      `Speed=${effectiveSpeed !== null ? effectiveSpeed.toFixed(1) : 'N/A'}km/h | ` +
      `GPSSpeed=${speed !== null && speed !== undefined ? speed.toFixed(1) : 'null'}km/h | ` +
      `State=${currentState} | Time=${new Date(timestamp).toLocaleTimeString()}`
    );

    // ─── 6. Evaluate state transitions ─────────────────────────────────────
    let newState = currentState;
    let event = null;
    const now = new Date().toISOString();

    switch (currentState) {
      case 'OUTSIDE':
        if (distance <= nextStop.approach_radius_m) {
          newState = 'APPROACHING';
          event = 'APPROACHING';
          console.log(
            `🟡 [StopDetection] Bus ${busId} APPROACHING "${nextStop.stop_name}" ` +
            `(${Math.round(distance)}m away, approachR=${nextStop.approach_radius_m}m)`
          );
        }
        break;

      case 'APPROACHING':
        // FIX: Removed the speed gate that was blocking ARRIVED.
        // Previously required: distance <= arrival_radius_m AND speed <= 5 km/h
        // The speed condition was too strict — GPS noise at 1s intervals creates
        // artificially high estimated speeds, preventing ARRIVED from ever firing.
        // Now: ARRIVED triggers purely on distance.
        if (distance <= nextStop.arrival_radius_m) {
          newState = 'ARRIVED';
          event = 'ARRIVED';
          console.log(
            `🟢 [StopDetection] Bus ${busId} ARRIVED at "${nextStop.stop_name}" ` +
            `(${Math.round(distance)}m, speed=${effectiveSpeed.toFixed(1)} km/h, arrivalR=${nextStop.arrival_radius_m}m)`
          );
        } else if (distance > nextStop.approach_radius_m + HYSTERESIS_BUFFER_M) {
          // PASS-THROUGH DETECTION:
          // If the bus was APPROACHING, but suddenly its distance > approach_radius, 
          // it means the GPS skipped/lagged and the bus drove entirely through the stop 
          // zone without registering an ARRIVED ping inside the 50m radius.
          // Instead of resetting to OUTSIDE (which would skip the stop and get stuck),
          // we assume they passed it and auto-complete the stop by marking it DEPARTED.
          newState = 'DEPARTED';
          event = 'DEPARTED';
          console.log(
            `🚀 [StopDetection] PASS-THROUGH: Bus ${busId} left approach zone of "${nextStop.stop_name}" ` +
            `without triggering ARRIVED. Auto-completing stop as DEPARTED.`
          );
        }
        break;

      case 'ARRIVED':
        if (distance > nextStop.arrival_radius_m + HYSTERESIS_BUFFER_M) {
          newState = 'DEPARTED';
          event = 'DEPARTED';
          console.log(
            `🔴 [StopDetection] Bus ${busId} DEPARTED from "${nextStop.stop_name}" ` +
            `(${Math.round(distance)}m away, arrivalR=${nextStop.arrival_radius_m}m + buffer=${HYSTERESIS_BUFFER_M}m)`
          );
        }
        // NOTE: Once ARRIVED, the bus stays ARRIVED until it crosses the arrival_radius + buffer.
        // The hysteresis buffer prevents GPS noise from causing rapid ARRIVED/DEPARTED toggling
        // at the boundary of the arrival zone.
        break;

      case 'DEPARTED':
        // DEPARTED is now a persistent state. The bus stays DEPARTED while still
        // within the approach_radius of the stop it just left. Once it crosses
        // the approach_radius, it transitions to OUTSIDE and advances to the next stop.
        if (distance > nextStop.approach_radius_m) {
          newState = 'OUTSIDE';
          console.log(
            `🏃 [StopDetection] Bus ${busId} cleared approach zone of "${nextStop.stop_name}" ` +
            `(${Math.round(distance)}m > approachR=${nextStop.approach_radius_m}m) — now RUNNING towards next stop.`
          );
        }
        break;

      default:
        console.warn(`⚠️ [StopDetection] Unknown state "${currentState}" for bus ${busId}.`);
        newState = 'OUTSIDE';
        break;
    }

    // Log state transition result
    if (event) {
      console.log(
        `🔄 [DIAG] STATE CHANGE: ${currentState} → ${newState} (event=${event}) | ` +
        `Dist=${Math.round(distance)}m | Bus=${busId}`
      );
    }

    // ─── 7. On DEPARTED→OUTSIDE: advance to the next stop in sequence ──────
    let advancedToStopId = null;
    let advancedToStopName = null;

    if (currentState === 'DEPARTED' && newState === 'OUTSIDE') {
      const advancedStop = await stopDb.getNextStop(route_id, nextStop.sequence_no);

      if (advancedStop) {
        advancedToStopId = advancedStop.stop_id;
        advancedToStopName = advancedStop.stop_name;
        console.log(
          `➡️ [StopDetection] Bus ${busId} next target: "${advancedStop.stop_name}" (seq ${advancedStop.sequence_no})`
        );
      } else {
        // No more stops — bus completed the route
        console.log(`🏁 [StopDetection] Bus ${busId} completed all stops on route ${route_id}.`);
        // Reset to first stop for the next trip
        const firstStop = await stopDb.getFirstStop(route_id);
        if (firstStop) {
          advancedToStopId = firstStop.stop_id;
          advancedToStopName = firstStop.stop_name;
          // Clear notification log for a fresh cycle
          await stopDb.resetNotificationsForBus(busId);
          console.log(`🔄 [StopDetection] Bus ${busId} reset to first stop: "${firstStop.stop_name}"`);
        }
      }
    }

    // ─── 8. Update bus state in database ───────────────────────────────────
    if (event || newState !== currentState) {
      const updateData = {
        route_id,
        latitude: lat,
        longitude: lon,
        speed: effectiveSpeed,
        state: newState,
        current_stop_id: (event === 'ARRIVED' || event === 'DEPARTED') ? nextStop.stop_id : busState.current_stop_id,
        next_stop_id: advancedToStopId || next_stop_id,
        last_event: event || busState.last_event,
        last_event_time: event ? now : busState.last_event_time
      };

      await stopDb.upsertBusState(busId, updateData);
    } else {
      // No state change — just update position and speed
      await stopDb.upsertBusState(busId, {
        route_id,
        latitude: lat,
        longitude: lon,
        speed: effectiveSpeed,
        state: currentState,
        current_stop_id: busState.current_stop_id,
        next_stop_id: busState.next_stop_id,
        last_event: busState.last_event,
        last_event_time: busState.last_event_time
      });
    }

    // ─── 9. Return the detected event (or null) ───────────────────────────
    if (event) {
      return {
        event,
        stopId: nextStop.stop_id,
        stopName: nextStop.stop_name,
        state: newState,
        distance: Math.round(distance),
        speed: effectiveSpeed,
        nextStopId: advancedToStopId,
        nextStopName: advancedToStopName
      };
    }

    return null;
  } catch (err) {
    console.error(`❌ [StopDetection] Error for bus ${busId}:`, err.message);
    return null;
  }
};

module.exports = { detectStopEvent, HYSTERESIS_BUFFER_M };
