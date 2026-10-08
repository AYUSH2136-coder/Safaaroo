import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:geolocator/geolocator.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/app_config.dart';

/// Manages background location transmission for drivers via `flutter_background_service`.
/// Ensures continuous location streaming to backend even when app is minimized or screen is locked.
class BackgroundLocationService {
  static final BackgroundLocationService _instance = BackgroundLocationService._internal();
  factory BackgroundLocationService() => _instance;

  BackgroundLocationService._internal();

  /// Initializes the background service configuration.
  /// Must be called during app startup (in `main.dart`).
  static Future<void> initialize() async {
    final service = FlutterBackgroundService();

    await service.configure(
      androidConfiguration: AndroidConfiguration(
        onStart: onStart,
        autoStart: false,
        isForegroundMode: true,
        notificationChannelId: 'safaaroo_driver_tracking_channel',
        initialNotificationTitle: 'SafaaRoo Live Tracking',
        initialNotificationContent: 'Background location service starting...',
        foregroundServiceNotificationId: 999,
        foregroundServiceTypes: [AndroidForegroundType.location],
      ),
      iosConfiguration: IosConfiguration(
        autoStart: false,
        onForeground: onStart,
        onBackground: onIosBackground,
      ),
    );
  }

  /// Starts background location tracking for a specific [vehicleId].
  Future<bool> startTracking(String vehicleId) async {
    final service = FlutterBackgroundService();
    bool isRunning = await service.isRunning();
    if (!isRunning) {
      isRunning = await service.startService();
    }

    if (isRunning) {
      service.invoke('startTracking', {'vehicleId': vehicleId});
      return true;
    }
    return false;
  }

  /// Stops background location tracking.
  Future<void> stopTracking() async {
    final service = FlutterBackgroundService();
    if (await service.isRunning()) {
      service.invoke('stopService');
    }
  }

  /// Returns whether background tracking service is currently running.
  Future<bool> isRunning() async {
    return await FlutterBackgroundService().isRunning();
  }

  /// Listens to location updates emitted from the background isolate to UI.
  Stream<Map<String, dynamic>>? onLocationUpdate() {
    return FlutterBackgroundService().on('updateLocation').map((event) {
      return Map<String, dynamic>.from(event ?? {});
    });
  }
}

@pragma('vm:entry-point')
Future<bool> onIosBackground(ServiceInstance service) async {
  WidgetsFlutterBinding.ensureInitialized();
  DartPluginRegistrant.ensureInitialized();
  return true;
}

@pragma('vm:entry-point')
void onStart(ServiceInstance service) async {
  DartPluginRegistrant.ensureInitialized();
  WidgetsFlutterBinding.ensureInitialized();

  if (service is AndroidServiceInstance) {
    service.on('setAsForeground').listen((event) {
      service.setAsForegroundService();
    });

    service.on('setAsBackground').listen((event) {
      service.setAsBackgroundService();
    });
  }

  StreamSubscription<Position>? positionSubscription;
  io.Socket? socket;
  String? currentVehicleId;

  service.on('stopService').listen((event) async {
    if (socket != null && currentVehicleId != null) {
      if (socket!.connected) {
        socket!.emit('stop_transmission', {'deviceId': currentVehicleId});
      }
      socket!.disconnect();
      socket!.dispose();
      socket = null;
    }
    await positionSubscription?.cancel();
    positionSubscription = null;
    currentVehicleId = null;
    await service.stopSelf();
  });

  service.on('startTracking').listen((event) async {
    if (event == null) return;
    final vehicleId = event['vehicleId'] as String?;
    if (vehicleId == null || vehicleId.isEmpty) return;

    currentVehicleId = vehicleId;

    // Connect background socket
    socket?.disconnect();
    socket?.dispose();
    socket = io.io(
      AppConfig.socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .enableReconnection()
          .setReconnectionAttempts(double.maxFinite.toInt())
          .setReconnectionDelay(2000)
          .build(),
    );

    socket!.connect();

    // Start location updates
    final locationSettings = AndroidSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: AppConfig.locationDistanceFilter,
      forceLocationManager: true,
      intervalDuration: const Duration(seconds: 2),
    );

    await positionSubscription?.cancel();

    positionSubscription = Geolocator.getPositionStream(
      locationSettings: locationSettings,
    ).listen((Position position) {
      final isConnected = socket?.connected ?? false;

      if (isConnected) {
        socket!.emit('send_location', {
          'deviceId': vehicleId,
          'vehicleId': vehicleId,
          'latitude': position.latitude,
          'longitude': position.longitude,
          'speed': position.speed,
        });
      }

      if (service is AndroidServiceInstance) {
        final speedKmh = (position.speed * 3.6).toStringAsFixed(1);
        service.setForegroundNotificationInfo(
          title: 'SafaaRoo Live Bus Transmission',
          content: 'Vehicle: $vehicleId • $speedKmh km/h • ${isConnected ? "Connected" : "Connecting..."}',
        );
      }

      service.invoke('updateLocation', {
        'latitude': position.latitude,
        'longitude': position.longitude,
        'speed': position.speed,
        'accuracy': position.accuracy,
        'timestamp': DateTime.now().toIso8601String(),
        'socketConnected': isConnected,
      });
    }, onError: (_) {});
  });
}
