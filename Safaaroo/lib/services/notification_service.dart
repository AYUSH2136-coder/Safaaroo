import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Manages local push notifications for bus arrival alerts.
class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;

  NotificationService._internal();

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  bool _initialized = false;

  /// Initializes the notification plugin and creates the Android channel.
  Future<void> initialize() async {
    if (_initialized) return;

    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );

    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _plugin.initialize(settings: initSettings);

    // Create the Android notification channels
    const channel = AndroidNotificationChannel(
      'safaaroo_bus_alerts',
      'Bus Alerts',
      description: 'Real-time school bus arrival and departure notifications',
      importance: Importance.high,
    );

    const trackingChannel = AndroidNotificationChannel(
      'safaaroo_driver_tracking_channel',
      'SafaaRoo Live Tracking',
      description: 'Background location service for bus tracking',
      importance: Importance.low, // Use low importance for ongoing background service
    );

    final androidPlugin = _plugin
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();

    if (androidPlugin != null) {
      await androidPlugin.createNotificationChannel(channel);
      await androidPlugin.createNotificationChannel(trackingChannel);
    }

    _initialized = true;
  }

  /// Shows a local notification with the given [title] and [body].
  Future<void> showNotification({
    required String title,
    required String body,
    int id = 0,
  }) async {
    if (!_initialized) await initialize();

    const androidDetails = AndroidNotificationDetails(
      'safaaroo_bus_alerts',
      'Bus Alerts',
      channelDescription:
          'Real-time school bus arrival and departure notifications',
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
      icon: '@mipmap/ic_launcher',
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    const details = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    await _plugin.show(id: id, title: title, body: body, notificationDetails: details);
  }

  /// Shows a "bus approaching" notification to the parent.
  Future<void> showBusApproachingNotification({
    required String vehicleId,
    required String? driverName,
  }) async {
    await showNotification(
      title: '🚌 Bus is Approaching!',
      body: driverName != null
          ? 'Bus $vehicleId driven by $driverName is near your location.'
          : 'Bus $vehicleId is near your location. Get ready!',
      id: vehicleId.hashCode,
    );
  }

  /// Cancels all notifications.
  Future<void> cancelAll() async {
    await _plugin.cancelAll();
  }
}
