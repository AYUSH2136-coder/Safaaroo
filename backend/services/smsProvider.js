/**
 * smsProvider.js — SMS Gateway Integration
 * 
 * Sends SMS messages via the custom Flask SMS gateway server.
 * The gateway relays messages to a Flutter app over WebSocket,
 * which physically sends the SMS from the connected phone.
 * 
 * Gateway API:
 *   POST http://<host>:8080/send_sms
 *   Body: { "to": "+91...", "message": "..." }
 */

// SMS Gateway URL — configurable via .env
const { sendSmsToFlutter } = require('../sockets/smsSocket');

/**
 * Send an SMS message via the internal WebSocket to the Flutter app.
 *
 * @param {string} phone   - Recipient phone number (e.g., "+919876543210")
 * @param {string} message - SMS body text
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
const sendSms = async (phone, message) => {
  try {
    const success = sendSmsToFlutter(phone, message);
    
    if (success) {
      return { success: true, data: { status: 'Sent via internal websocket' } };
    } else {
      return { success: false, error: 'Flutter app not connected to /ws' };
    }
  } catch (err) {
    console.error(`❌ [SMS] Failed to send via internal WS: ${err.message}`);
    return { success: false, error: err.message };
  }
};

module.exports = { sendSms };
