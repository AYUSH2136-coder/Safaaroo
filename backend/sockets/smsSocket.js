const { WebSocketServer } = require('ws');

let flutterWs = null;

const initSmsSocket = (server) => {
  // Attach a raw WebSocket server to the existing HTTP server for the Flutter SMS Gateway
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws) => {
    console.log('===== NEW SMS GATEWAY WEBSOCKET (FLUTTER APP CONNECTED) =====');
    flutterWs = ws;

    ws.on('message', (message) => {
      console.log('Received from Flutter SMS Gateway:', message.toString());
    });

    ws.on('close', () => {
      console.log('Flutter SMS Gateway disconnected');
      if (flutterWs === ws) {
        flutterWs = null;
      }
    });
    
    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  });
};

/**
 * Send SMS command directly to the connected Flutter app over WebSocket
 */
const sendSmsToFlutter = (to, message) => {
  if (flutterWs && flutterWs.readyState === 1 /* OPEN */) {
    try {
      flutterWs.send(JSON.stringify({ to, message }));
      console.log(`📱 [SMS Gateway] Command sent to Flutter app for ${to}`);
      return true;
    } catch (e) {
      console.error(`❌ [SMS Gateway] Error sending to WebSocket:`, e);
      return false;
    }
  } else {
    console.log('❌ [SMS Gateway] Flutter app is NOT connected via WebSocket');
    return false;
  }
};

module.exports = { initSmsSocket, sendSmsToFlutter };
