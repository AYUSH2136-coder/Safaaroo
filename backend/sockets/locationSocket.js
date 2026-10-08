
const db = require('../config/db');
const webpush = require('web-push');
const { detectStopEvent } = require('../services/stopDetection');
const { sendStopNotification } = require('../services/notificationHandler');

// Configure web-push with VAPID keys from environment
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Track which socket belongs to which device (socket.id -> deviceId)
const socketDeviceMap = new Map();

// Track grace-period timers per device to avoid duplicate push notifications
const disconnectTimers = new Map();

// Grace period: wait this long after disconnect before sending push notification
const DISCONNECT_GRACE_MS = 15000; // 15 seconds

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`⚡ [Socket.IO] Client connected: ${socket.id}`);

    /**
     * Event: 'join_vehicle_room'
     * Sent by Parent clients to subscribe to a specific bus's location.
     * Payload: { vehicleId }
     */
    socket.on('join_vehicle_room', ({ vehicleId }) => {
      if (!vehicleId) return;
      const room = `vehicle:${vehicleId}`;
      socket.join(room);
      console.log(`👪 [Socket.IO] Socket ${socket.id} joined room ${room}`);
    });

    /**
     * Event: 'leave_vehicle_room'
     * Sent by Parent clients to unsubscribe from a bus's location.
     * Payload: { vehicleId }
     */
    socket.on('leave_vehicle_room', ({ vehicleId }) => {
      if (!vehicleId) return;
      const room = `vehicle:${vehicleId}`;
      socket.leave(room);
      console.log(`👋 [Socket.IO] Socket ${socket.id} left room ${room}`);
    });

    socket.on('join_slot_room', ({ slotNo }) => {
      const numericSlotNo = Number(slotNo);
      if (!Number.isSafeInteger(numericSlotNo) || numericSlotNo < 1) return;
      db.get(
        `SELECT slot_no FROM service_slots WHERE slot_no = ?`,
        [numericSlotNo],
        (err, slot) => {
          if (err || !slot || !socket.connected) return;
          const room = `slot:${numericSlotNo}`;
          socket.join(room);
          console.log(`👪 [Socket.IO] Socket ${socket.id} joined room ${room}`);
        },
      );
    });

    socket.on('leave_slot_room', ({ slotNo }) => {
      const numericSlotNo = Number(slotNo);
      if (!Number.isSafeInteger(numericSlotNo) || numericSlotNo < 1) return;
      socket.leave(`slot:${numericSlotNo}`);
    });

    /**
     * Event: 'send_location'
     * Received from Transmitter at the configured interval (e.g. every 1 second)
     * Payload: { deviceId, latitude, longitude, speed? }
     */
    socket.on('send_location', (data) => {
      const { deviceId, latitude, longitude, speed } = data;

      if (!deviceId || latitude === undefined || longitude === undefined) {
        console.error('⚠️ [Socket.IO] Invalid location payload received:', data);
        return;
      }

      // Map this socket to its deviceId (needed for disconnect handler)
      socketDeviceMap.set(socket.id, deviceId);

      // If this device reconnected, cancel any pending disconnect timer
      if (disconnectTimers.has(deviceId)) {
        clearTimeout(disconnectTimers.get(deviceId));
        disconnectTimers.delete(deviceId);
        console.log(`✅ [Reconnect] Device ${deviceId} reconnected — cancelled stale timer.`);
      }

      const currentTime = Date.now();
      const currentIsoDate = new Date().toISOString();

      // SQL Query: Update device status, coordinates, and last_update timestamp
      const updateQuery = `
        UPDATE devices
        SET 
          latitude = ?,
          longitude = ?,
          status = 'online',
          is_transmitting = 1,
          last_update = ?,
          updated_at = ?
        WHERE device_id = ?
      `;

      db.run(
        updateQuery,
        [latitude, longitude, currentTime, currentIsoDate, deviceId],
        async function (err) {
          if (err) {
            console.error('❌ [Database] Error updating location:', err.message);
            return;
          }

          const vehicleId = data.vehicleId || deviceId;

          // ── Validate via transmission_sessions (target architecture) ──
          let activeSession;
          try {
            activeSession = await new Promise((resolve, reject) => {
              db.get(
                `SELECT ts.session_id, ts.driver_id, ts.vehicle_id, ts.slot_no
                 FROM transmission_sessions ts
                 WHERE ts.vehicle_id = ? AND ts.status = 'ACTIVE'
                 LIMIT 1`,
                [vehicleId],
                (claimErr, row) => claimErr ? reject(claimErr) : resolve(row),
              );
            });
          } catch (claimErr) {
            console.error('❌ [Transmission] Could not verify session:', claimErr.message);
            return;
          }

          // Fall back to legacy vehicle claim check if no session exists yet
          if (!activeSession) {
            const activeClaim = await new Promise((resolve, reject) => {
              db.get(
                `SELECT driver_id, status FROM vehicles WHERE vehicle_id = ?`,
                [vehicleId],
                (claimErr, row) => claimErr ? reject(claimErr) : resolve(row),
              );
            }).catch(() => null);
            if (!activeClaim || !activeClaim.driver_id || activeClaim.status !== 'active') {
              console.warn(`⚠️ [Transmission] Ignoring location without an active claim for ${vehicleId}.`);
              return;
            }
          }

          // ── Update transmission session with latest GPS ──
          if (activeSession) {
            db.run(
              `UPDATE transmission_sessions SET last_lat = ?, last_lng = ?, last_speed = ?, last_update = ?
               WHERE session_id = ?`,
              [latitude, longitude, speed !== undefined ? parseFloat(speed) : null, currentIsoDate, activeSession.session_id],
            );
          }

          console.log(
            `📍 [Location Received] Device: ${deviceId} | Lat: ${latitude} | Lng: ${longitude}`
          );

          // Construct response payload to push to all connected receivers
          const updatedDeviceData = {
            device_id: deviceId,
            latitude: latitude,
            longitude: longitude,
            status: 'online',
            is_transmitting: 1,
            last_update: currentTime,
            updated_at: currentIsoDate
          };

          // ── Legacy: Broadcast to ALL connected sockets (existing Receivers) ──
          io.emit('location_updated', updatedDeviceData);

          // ── New: Also broadcast to vehicle-specific room if vehicleId provided ──
          const vehicleRoom = `vehicle:${vehicleId}`;
          const vehiclePayload = {
            ...updatedDeviceData,
            vehicle_id: vehicleId,
            speed: data.speed !== undefined ? parseFloat(data.speed) : null
          };
          io.to(vehicleRoom).emit('vehicle_location_updated', vehiclePayload);

          // ── Route GPS to the Slot room via slot_assignments (TARGET ARCHITECTURE) ──
          // This is the critical path: resolve slot from the ACTIVE assignment, not
          // from a hard-coded service_slots.vehicle_id lookup. This means when Bus B
          // replaces Bus A, the assignment points to the correct slot automatically.
          const resolveSlotNo = activeSession?.slot_no;
          if (resolveSlotNo) {
            io.to(`slot:${resolveSlotNo}`).emit('vehicle_location_updated', {
              ...vehiclePayload,
              slot_no: resolveSlotNo,
            });
          } else {
            // Legacy fallback: resolve from service_slots table directly
            db.get(
              `SELECT slot_no FROM service_slots WHERE vehicle_id = ?`,
              [vehicleId],
              (slotErr, slot) => {
                if (slotErr) {
                  console.error('❌ [SlotRoom] Could not resolve service slot:', slotErr.message);
                  return;
                }
                if (slot) {
                  io.to(`slot:${slot.slot_no}`).emit('vehicle_location_updated', {
                    ...vehiclePayload,
                    slot_no: slot.slot_no,
                  });
                }
              },
            );
          }

          // ─── Run automatic stop detection ──────────────────────────────
          try {
            const detectionResult = await detectStopEvent(
              deviceId,
              parseFloat(latitude),
              parseFloat(longitude),
              speed !== undefined ? parseFloat(speed) : null,
              currentTime
            );

            if (detectionResult) {
              // Send SMS notifications to per-stop subscribers
              await sendStopNotification(
                deviceId,
                detectionResult.stopId,
                detectionResult.stopName,
                detectionResult.event,
                io,
                detectionResult.distance
              );

              // Broadcast updated bus state to dashboard clients
              const stopDb = require('../services/stopDb');
              const updatedState = await stopDb.getBusState(deviceId);
              if (updatedState) {
                io.emit('bus_state_updated', updatedState);
              }
            }
          } catch (detectionErr) {
            console.error('❌ [StopDetection] Socket handler error:', detectionErr.message);
          }
        }
      );
    });

    /**
     * Event: 'stop_transmission'
     * Received when user turns off transmitter mode
     */
    socket.on('stop_transmission', (data) => {
      const { deviceId } = data;
      if (!deviceId) return;

      // Clean up mapping and any pending timer (intentional stop, no push needed)
      socketDeviceMap.delete(socket.id);
      if (disconnectTimers.has(deviceId)) {
        clearTimeout(disconnectTimers.get(deviceId));
        disconnectTimers.delete(deviceId);
      }

      const updateQuery = `
        UPDATE devices
        SET is_transmitting = 0, status = 'offline', updated_at = ?
        WHERE device_id = ?
      `;

      db.run(updateQuery, [new Date().toISOString(), deviceId], (err) => {
        if (err) {
          console.error('❌ [Database] Error stopping transmission:', err.message);
          return;
        }

        console.log(`🛑 [Transmission Stopped] Device: ${deviceId}`);

        // Notify receivers that this device stopped transmitting
        io.emit('device_status_changed', {
          device_id: deviceId,
          status: 'offline',
          is_transmitting: 0
        });
      });
    });

    /**
     * Handle Client Disconnection
     * Start a grace-period timer. If the device doesn't reconnect within
     * DISCONNECT_GRACE_MS, mark it offline and send a push notification.
     */
    socket.on('disconnect', () => {
      console.log(`🔌 [Socket.IO] Client disconnected: ${socket.id}`);

      const deviceId = socketDeviceMap.get(socket.id);
      socketDeviceMap.delete(socket.id);

      // Only start grace timer for transmitting devices (not receivers/anonymous)
      if (!deviceId) return;

      console.log(`⏳ [Grace Period] Starting ${DISCONNECT_GRACE_MS / 1000}s timer for device: ${deviceId}`);

      const timer = setTimeout(() => {
        disconnectTimers.delete(deviceId);

        db.get(
          `SELECT driver_id FROM vehicles WHERE vehicle_id = ? AND status = 'active'`,
          [deviceId],
          (claimErr, claim) => {
            if (claimErr || !claim?.driver_id) return;
            const driverId = claim.driver_id;
            
            // 1. End transmission session
            db.run(
              `UPDATE transmission_sessions SET status = 'ENDED', ended_at = CURRENT_TIMESTAMP
               WHERE driver_id = ? AND vehicle_id = ? AND status = 'ACTIVE'`,
              [driverId, deviceId],
            );

            // 2. End slot assignment
            db.run(
              `UPDATE slot_assignments SET status = 'ENDED', ended_at = CURRENT_TIMESTAMP
               WHERE driver_id = ? AND vehicle_id = ? AND status = 'ACTIVE'`,
              [driverId, deviceId],
            );

            // 3. Release vehicle claim
            db.run(
              `UPDATE vehicles SET driver_id = NULL, status = 'inactive'
               WHERE vehicle_id = ? AND driver_id = ?`,
              [deviceId, driverId],
            );

            // 4. Clear driver profile
            db.run(
              `UPDATE driver_profiles SET vehicle_id = NULL, operator_id = NULL
               WHERE user_id = ? AND vehicle_id = ?`,
              [driverId, deviceId],
            );
          },
        );

        // Check if the device is still offline (hasn't reconnected)
        db.get(
          `SELECT device_id, status, is_transmitting, push_subscription FROM devices WHERE device_id = ?`,
          [deviceId],
          (err, row) => {
            if (err) {
              console.error('❌ [Database] Error checking device status:', err.message);
              return;
            }

            if (!row) return;

            // If device reconnected during grace period, status would be 'online' — skip
            if (row.status === 'online' && row.is_transmitting === 1) {
              console.log(`✅ [Grace Period] Device ${deviceId} is back online — no push needed.`);
              return;
            }

            // Mark device offline in DB
            db.run(
              `UPDATE devices SET status = 'offline', is_transmitting = 0, updated_at = ? WHERE device_id = ?`,
              [new Date().toISOString(), deviceId],
              (updateErr) => {
                if (updateErr) {
                  console.error('❌ [Database] Error marking device offline:', updateErr.message);
                }
              }
            );

            // Notify receivers
            io.emit('device_status_changed', {
              device_id: deviceId,
              status: 'offline',
              is_transmitting: 0
            });

            console.log(`📴 [Stale Disconnect] Device ${deviceId} did not reconnect — marked offline.`);

            // Send push notification if subscription exists
            if (row.push_subscription) {
              try {
                const subscription = JSON.parse(row.push_subscription);
                const payload = JSON.stringify({
                  title: '⚠️ Tracking Interrupted',
                  body: 'Your device stopped transmitting. Tap to reopen and resume.',
                  url: '/transmitter'
                });

                webpush.sendNotification(subscription, payload)
                  .then(() => {
                    console.log(`🔔 [Push] Notification sent to device: ${deviceId}`);
                  })
                  .catch((pushErr) => {
                    console.error(`❌ [Push] Error sending notification to ${deviceId}:`, pushErr.message);
                    // If subscription expired (410 Gone), clear it from DB
                    if (pushErr.statusCode === 410) {
                      db.run(
                        `UPDATE devices SET push_subscription = NULL WHERE device_id = ?`,
                        [deviceId]
                      );
                      console.log(`🗑️ [Push] Expired subscription cleared for device: ${deviceId}`);
                    }
                  });
              } catch (parseErr) {
                console.error(`❌ [Push] Invalid subscription JSON for ${deviceId}:`, parseErr.message);
              }
            } else {
              console.log(`ℹ️ [Push] No push subscription found for device: ${deviceId}`);
            }
          }
        );
      }, DISCONNECT_GRACE_MS);

      disconnectTimers.set(deviceId, timer);
    });
  });
};