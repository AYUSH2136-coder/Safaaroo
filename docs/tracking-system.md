# SafaaRoo Tracking System Lifecycle

This document explains the current live tracking lifecycle and data flow, detailing exactly how a Driver's GPS coordinate propagates to a Parent's Live Tracker Dashboard.

## The Tracking Lifecycle

1. **Driver Login & Setup**: 
   The Driver logs into the Flutter application and selects a specific Vehicle from their history, or adds a new one provided by the Operator.
2. **Start Transmission**: 
   The Driver toggles tracking ON. The app requests background location permissions.
   - The Flutter app calls `POST /api/driver/start-transmission` with the `vehicle_id`.
   - The Backend claims the vehicle for the driver, creates a new `ACTIVE` record in `transmission_sessions`, and dynamically generates an `ACTIVE` `slot_assignments` record mapping that physical Vehicle to its logical Service Slot.
3. **GPS Stream & Socket Connection**:
   - The Driver app establishes a Socket.IO connection.
   - Using `Geolocator` and `flutter_background_service`, the app streams GPS coordinates via the `send_location` Socket.IO event.
4. **Backend Processing (Coordinates Received)**:
   - When the server receives `send_location` (containing `deviceId`, `latitude`, `longitude`, `speed`), it updates the legacy `devices` table (`status = 'online'`).
   - It queries `transmission_sessions` to verify an active trip exists for the vehicle.
   - It updates the `last_lat`, `last_lng`, and `last_speed` on the active `transmission_sessions` record.
5. **Broadcasting to Parents**:
   - The server identifies the `resolveSlotNo` (the Service Slot currently assigned to this active trip).
   - It emits a `vehicle_location_updated` event exclusively to the Socket.IO room `slot:{resolveSlotNo}`.
6. **Parent Client Updates**:
   - The Parent app (which previously emitted `join_slot_room` with their `slot_no` upon opening the Live Tracker) receives the `vehicle_location_updated` event.
   - The Parent app parses the GPS coordinates, updates the live bus marker organically on the Journey Timeline, and reflects the active speed.
7. **Stop Transmission**:
   - The Driver toggles tracking OFF.
   - The Flutter app calls `POST /api/driver/stop-transmission`.
   - The Backend marks the `transmission_sessions` and `slot_assignments` as `ENDED`, and releases the Vehicle claim.
   - The Driver emits `stop_transmission` to Socket.IO, updating `devices` to `status = 'offline'`. Parents observe the bus marker change state.

## Disconnection & Stale Handling

- If the Driver's socket drops unexpectedly (e.g., poor network), the server starts a 15-second grace period (`DISCONNECT_GRACE_MS`).
- If the driver reconnects within 15 seconds, tracking continues seamlessly.
- If the driver does NOT reconnect, the server triggers the stale disconnect logic: marks the device offline, ends the transmission session, ends the slot assignment, releases the vehicle, and dispatches a Web Push Notification to the driver advising them that tracking was interrupted.
