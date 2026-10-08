/**
 * notificationHandler.js — Stop Event Notification Dispatcher
 *
 * Handles sending SMS notifications to per-stop subscribers when
 * a bus triggers a state transition (APPROACHING / ARRIVED / DEPARTED).
 *
 * Features:
 * - Deduplication via notification_log table (same bus+stop+event = send once)
 * - Per-stop subscriber lookup
 * - Socket.IO broadcast for real-time dashboard updates
 * - SMS delivery via the custom Flask SMS gateway
 */

const stopDb = require('./stopDb');
const { sendSms } = require('./smsProvider');

/**
 * Build a human-readable SMS message for the stop event.
 *
 * @param {string} eventType - 'APPROACHING', 'ARRIVED', or 'DEPARTED'
 * @param {string} stopName  - Name of the stop
 * @param {string} busId     - Bus identifier
 * @param {number} [distance] - Distance in meters (optional)
 * @returns {string} SMS message body
 */
const buildMessage = (eventType, stopName, busId, distance) => {
  switch (eventType) {
    case 'APPROACHING':
      return (
        `🚌 SafarNama Alert\n` +
        `Bus ${busId} is approaching "${stopName}"\n` +
        `Distance: ~${distance || '?'}m\n` +
        `Please be ready at the stop.`
      );

    case 'ARRIVED':
      return (
        `🟢 SafarNama Alert\n` +
        `Bus ${busId} has ARRIVED at "${stopName}"\n` +
        `The bus is now at the stop. Please board.`
      );

    case 'DEPARTED':
      return (
        `🔴 SafarNama Alert\n` +
        `Bus ${busId} has DEPARTED from "${stopName}"\n` +
        `The bus has left this stop.`
      );

    default:
      return `SafarNama: Bus ${busId} — ${eventType} at ${stopName}`;
  }
};

/**
 * Send notifications for a stop event. Idempotent — skips if already sent.
 *
 * @param {string} busId     - Bus identifier
 * @param {string} stopId    - Stop ID where the event occurred
 * @param {string} stopName  - Stop name (for message text)
 * @param {string} eventType - 'APPROACHING', 'ARRIVED', or 'DEPARTED'
 * @param {Object} io        - Socket.IO server instance (for real-time broadcast)
 * @param {number} [distance] - Distance in meters (optional, for APPROACHING)
 * @returns {Promise<{ sent: boolean, subscriberCount: number }>}
 */
const sendStopNotification = async (busId, stopId, stopName, eventType, io, distance) => {
  try {
    // ─── 1. Dedup check — have we already sent this exact notification? ────
    const alreadySent = await stopDb.hasNotification(busId, stopId, eventType);
    if (alreadySent) {
      console.log(
        `ℹ️ [Notification] Skipping duplicate: ${eventType} for bus ${busId} at "${stopName}"`
      );
      return { sent: false, subscriberCount: 0, reason: 'duplicate' };
    }

    // ─── 2. Fetch subscribers for this stop ────────────────────────────────
    const subscribers = await stopDb.getStopSubscribers(stopId);
    const message = buildMessage(eventType, stopName, busId, distance);

    console.log(
      `📢 [Notification] ${eventType} — Bus ${busId} at "${stopName}" → ${subscribers.length} subscriber(s)`
    );

    // ─── 3. Send SMS to each subscriber ────────────────────────────────────
    const smsResults = [];
    for (const sub of subscribers) {
      const result = await sendSms(sub.phone, message);
      smsResults.push({ phone: sub.phone, ...result });
    }

    // ─── 4. Broadcast via Socket.IO for real-time dashboard ────────────────
    if (io) {
      io.emit('stop_event', {
        bus_id: busId,
        stop_id: stopId,
        stop_name: stopName,
        event: eventType,
        distance,
        timestamp: new Date().toISOString(),
        subscriber_count: subscribers.length
      });
    }

    // ─── 5. Log the notification to prevent future duplicates ──────────────
    await stopDb.logNotification(busId, stopId, eventType);

    return {
      sent: true,
      subscriberCount: subscribers.length,
      smsResults
    };
  } catch (err) {
    console.error(`❌ [Notification] Error sending ${eventType} for bus ${busId}:`, err.message);
    return { sent: false, error: err.message };
  }
};

module.exports = { sendStopNotification, buildMessage };
