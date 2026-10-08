import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/app_config.dart';

/// Manages the Socket.IO connection to the backend.
/// Mirrors the web frontend `socket.js` configuration exactly.
class SocketService {
  static final SocketService _instance = SocketService._internal();
  factory SocketService() => _instance;

  io.Socket? _socket;

  SocketService._internal();

  /// Returns the shared socket instance, connecting if not already connected.
  /// Mirrors `getSocket()` from the web frontend.
  io.Socket getSocket() {
    _socket ??= io.io(
      AppConfig.socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .disableAutoConnect() // Control manually
          .enableReconnection()
          .setReconnectionAttempts(double.maxFinite.toInt()) // Infinity
          .setReconnectionDelay(2000)
          .setReconnectionDelayMax(10000)
          .build(),
    );

    if (!_socket!.connected) {
      _socket!.connect();
    }

    return _socket!;
  }

  /// Whether the socket is currently connected.
  bool get isConnected => _socket?.connected ?? false;

  // ─── Driver Events ──────────────────────────────────────────────────────

  /// Emits a GPS location update to the backend.
  /// Matches: `socket.emit('send_location', {...})`
  void sendLocation({
    required String deviceId,
    required String vehicleId,
    required double latitude,
    required double longitude,
    double? speed,
  }) {
    getSocket().emit('send_location', {
      'deviceId': deviceId,
      'vehicleId': vehicleId,
      'latitude': latitude,
      'longitude': longitude,
      if (speed != null) 'speed': speed,
    });
  }

  /// Notifies the backend that the driver stopped transmitting.
  /// Matches: `socket.emit('stop_transmission', { deviceId })`
  void stopTransmission(String deviceId) {
    getSocket().emit('stop_transmission', {'deviceId': deviceId});
  }

  // ─── Parent Events ─────────────────────────────────────────────────────

  /// Subscribes a parent to a specific vehicle's room.
  /// Matches: `socket.emit('join_vehicle_room', { vehicleId })`
  void joinVehicleRoom(String vehicleId) {
    getSocket().emit('join_vehicle_room', {'vehicleId': vehicleId});
  }

  /// Unsubscribes a parent from a vehicle's room.
  /// Matches: `socket.emit('leave_vehicle_room', { vehicleId })`
  void leaveVehicleRoom(String vehicleId) {
    getSocket().emit('leave_vehicle_room', {'vehicleId': vehicleId});
  }

  /// Subscribes a parent to the stable service slot, independent of its bus.
  void joinSlotRoom(int slotNo) {
    getSocket().emit('join_slot_room', {'slotNo': slotNo});
  }

  /// Unsubscribes a parent from a stable service slot.
  void leaveSlotRoom(int slotNo) {
    getSocket().emit('leave_slot_room', {'slotNo': slotNo});
  }

  /// Listens for real-time vehicle location updates.
  /// Matches: `socket.on('vehicle_location_updated', callback)`
  void onVehicleLocationUpdated(Function(dynamic) callback) {
    getSocket().on('vehicle_location_updated', callback);
  }

  /// Listens for device status changes.
  void onDeviceStatusChanged(Function(dynamic) callback) {
    getSocket().on('device_status_changed', callback);
  }

  /// Listens for connection events.
  void onConnect(Function() callback) {
    getSocket().onConnect((_) => callback());
  }

  /// Listens for disconnection events.
  void onDisconnect(Function() callback) {
    getSocket().onDisconnect((_) => callback());
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────

  /// Removes all listeners for a given event name.
  void off(String event) {
    _socket?.off(event);
  }

  /// Disconnects the socket completely.
  void disconnect() {
    _socket?.disconnect();
  }

  /// Disposes the socket entirely (used on logout).
  void dispose() {
    _socket?.dispose();
    _socket = null;
  }
}
