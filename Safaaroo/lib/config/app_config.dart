/// Centralized configuration for the SafaaRoo app.
///
/// Change [baseUrl] to match your testing setup:
/// • Android Emulator → `http://10.0.2.2:5000`
/// • Real device on same Wi-Fi → `http://192.168.x.x:5000`
/// • Public tunnel (localtunnel / ngrok) → `https://your-tunnel.loca.lt`
/// • Production cloud host → `https://safaaroo-api.onrender.com`
class AppConfig {
  AppConfig._();

  static const String baseUrl =
      'https://chubbiest-rachiform-rosanna.ngrok-free.dev';

  // ─── API Endpoints ────────────────────────────────────────────────────
  static const String apiUrl = '$baseUrl/api';

  // ─── Socket.IO ────────────────────────────────────────────────────────
  static const String socketUrl = baseUrl;

  // ─── Timeouts ─────────────────────────────────────────────────────────
  static const int connectTimeoutMs = 15000;
  static const int receiveTimeoutMs = 15000;

  // ─── App Info ─────────────────────────────────────────────────────────
  static const String appName = 'SafaaRoo';
  static const String appVersion = '1.0.0';

  // ─── Secure Storage Keys ──────────────────────────────────────────────
  static const String authTokenKey = 'safaaroo_auth_token';
  static const String authUserKey = 'safaaroo_auth_user';

  // ─── Location Tracking ────────────────────────────────────────────────
  static const int locationIntervalMs = 2000; // GPS update interval
  static const int locationDistanceFilter = 5; // metres

  // ─── Mapbox ───────────────────────────────────────────────────────────
  static const String mapboxAccessToken = String.fromEnvironment(
      'MAPBOX_ACCESS_TOKEN', defaultValue: '');
  static const String mapboxStyleUrl = 'mapbox://styles/mapbox/light-v11';
}
