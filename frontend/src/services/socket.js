
import { io } from 'socket.io-client';

// Pass empty arguments or window.location.origin to connect to the current server
export const socket = io({
  autoConnect: false,          // Control manually when to connect/disconnect
  reconnection: true,          // Auto-reconnect when connection is lost
  reconnectionAttempts: Infinity, // Keep retrying forever (phone call / background)
  reconnectionDelay: 2000,     // Wait 2s before first retry
  reconnectionDelayMax: 10000, // Cap retry delay at 10s (exponential backoff)
  transports: ['websocket', 'polling']
});

/**
 * getSocket — returns the shared socket instance, connecting it if not already connected.
 * Used by DriverDashboard and ParentLiveTracker.
 */
export const getSocket = () => {
  if (!socket.connected) {
    socket.connect();
  }
  return socket;
};