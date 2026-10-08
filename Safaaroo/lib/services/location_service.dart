import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import '../config/app_config.dart';

/// Wraps the Geolocator package for GPS functionality.
/// Handles permissions, continuous tracking (driver), and one-shot reads (parent home detect).
class LocationService {
  static final LocationService _instance = LocationService._internal();
  factory LocationService() => _instance;

  LocationService._internal();

  StreamSubscription<Position>? _positionSubscription;

  /// Checks and requests location permissions.
  /// Returns `true` if permission is granted, `false` otherwise.
  Future<bool> checkAndRequestPermission() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return false;
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        return false;
      }
    }

    if (permission == LocationPermission.deniedForever) {
      return false;
    }

    return true;
  }

  /// Starts continuous GPS tracking.
  /// [onPosition] is called every time a new location is received.
  /// Used by the Driver Dashboard for live bus transmission.
  Future<bool> startTracking(void Function(Position position) onPosition) async {
    final hasPermission = await checkAndRequestPermission();
    if (!hasPermission) return false;

    // Cancel any existing subscription
    await stopTracking();

    LocationSettings locationSettings;

    if (defaultTargetPlatform == TargetPlatform.android) {
      locationSettings = AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: AppConfig.locationDistanceFilter,
        forceLocationManager: true,
        intervalDuration: const Duration(seconds: 2),
      );
    } else if (defaultTargetPlatform == TargetPlatform.iOS || defaultTargetPlatform == TargetPlatform.macOS) {
      locationSettings = AppleSettings(
        accuracy: LocationAccuracy.high,
        activityType: ActivityType.automotiveNavigation,
        distanceFilter: AppConfig.locationDistanceFilter,
        pauseLocationUpdatesAutomatically: true,
        showBackgroundLocationIndicator: true,
        allowBackgroundLocationUpdates: true,
      );
    } else {
      locationSettings = const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: AppConfig.locationDistanceFilter,
      );
    }

    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: locationSettings,
    ).listen(
      onPosition,
      onError: (error) {
        // Silently handle stream errors (e.g., momentary GPS glitch)
      },
    );

    return true;
  }

  /// Stops continuous GPS tracking.
  Future<void> stopTracking() async {
    await _positionSubscription?.cancel();
    _positionSubscription = null;
  }

  /// Gets the current position (one-shot).
  /// Used by the Parent for "Detect My Home" feature and Operator for GPS-based school coordinates.
  Future<Position?> getCurrentPosition() async {
    final hasPermission = await checkAndRequestPermission();
    if (!hasPermission) return null;

    return await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
      ),
    );
  }

  /// Whether GPS tracking is currently active.
  bool get isTracking => _positionSubscription != null;
}
