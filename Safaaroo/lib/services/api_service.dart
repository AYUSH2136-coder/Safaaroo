import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/app_config.dart';

/// Singleton HTTP client for all backend API calls.
/// Automatically attaches JWT Bearer token from secure storage.
class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;

  late final Dio _dio;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  ApiService._internal() {
    _dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.apiUrl,
        connectTimeout: const Duration(
          milliseconds: AppConfig.connectTimeoutMs,
        ),
        receiveTimeout: const Duration(
          milliseconds: AppConfig.receiveTimeoutMs,
        ),
        headers: {'Content-Type': 'application/json'},
      ),
    );

    // ── JWT Auto-Attach Interceptor ───────────────────────────────────────
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _storage.read(key: AppConfig.authTokenKey);
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (error, handler) {
          return handler.next(error);
        },
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Auth APIs
  // ═══════════════════════════════════════════════════════════════════════════

  /// POST /api/auth/login
  Future<Map<String, dynamic>> login(String mobile, String password) async {
    final response = await _dio.post(
      '/auth/login',
      data: {'mobile': mobile, 'password': password},
    );
    return response.data;
  }

  /// POST /api/auth/register
  Future<Map<String, dynamic>> register(Map<String, dynamic> payload) async {
    final response = await _dio.post('/auth/register', data: payload);
    return response.data;
  }

  /// GET /api/auth/me
  Future<Map<String, dynamic>> getMe() async {
    final response = await _dio.get('/auth/me');
    return response.data;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Operator APIs
  // ═══════════════════════════════════════════════════════════════════════════

  /// GET /api/operator/schools
  Future<Map<String, dynamic>> getOperatorSchools() async {
    final response = await _dio.get('/operator/schools');
    return response.data;
  }

  /// POST /api/operator/schools
  Future<Map<String, dynamic>> addSchool(Map<String, dynamic> payload) async {
    final response = await _dio.post('/operator/schools', data: payload);
    return response.data;
  }

  /// PUT /api/operator/schools/:id
  Future<Map<String, dynamic>> updateSchool(String schoolId, Map<String, dynamic> payload) async {
    final response = await _dio.put('/operator/schools/$schoolId', data: payload);
    return response.data;
  }

  /// DELETE /api/operator/schools/:id
  Future<Map<String, dynamic>> deleteSchool(String schoolId) async {
    final response = await _dio.delete('/operator/schools/$schoolId');
    return response.data;
  }

  /// GET /api/operator/vehicles
  Future<Map<String, dynamic>> getOperatorVehicles() async {
    final response = await _dio.get('/operator/vehicles');
    return response.data;
  }

  /// GET /api/operator/drivers
  Future<Map<String, dynamic>> getOperatorDrivers() async {
    final response = await _dio.get('/operator/drivers');
    return response.data;
  }

  /// GET /api/operator/slots
  Future<Map<String, dynamic>> getOperatorSlots() async {
    final response = await _dio.get('/operator/slots');
    return response.data;
  }

  /// POST /api/operator/vehicles
  Future<Map<String, dynamic>> addVehicle(Map<String, dynamic> payload) async {
    final response = await _dio.post('/operator/vehicles', data: payload);
    return response.data;
  }

  /// POST /api/operator/slots
  Future<Map<String, dynamic>> createSlot(Map<String, dynamic> payload) async {
    final response = await _dio.post('/operator/slots', data: payload);
    return response.data;
  }

  /// PUT /api/operator/vehicles/:id
  Future<Map<String, dynamic>> updateVehicle(
    String vehicleId,
    Map<String, dynamic> payload,
  ) async {
    final response = await _dio.put(
      '/operator/vehicles/$vehicleId',
      data: payload,
    );
    return response.data;
  }

  /// PUT /api/operator/slots/:slotNo
  Future<Map<String, dynamic>> updateSlot(
    int slotNo,
    Map<String, dynamic> payload,
  ) async {
    final response = await _dio.put('/operator/slots/$slotNo', data: payload);
    return response.data;
  }

  /// DELETE /api/operator/vehicles/:id
  Future<Map<String, dynamic>> deleteVehicle(String vehicleId) async {
    final response = await _dio.delete('/operator/vehicles/$vehicleId');
    return response.data;
  }

  /// DELETE /api/operator/slots/:slotNo
  Future<Map<String, dynamic>> deleteSlot(int slotNo) async {
    final response = await _dio.delete('/operator/slots/$slotNo');
    return response.data;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Driver APIs
  // ═══════════════════════════════════════════════════════════════════════════

  /// GET /api/driver/profile
  Future<Map<String, dynamic>> getDriverProfile() async {
    final response = await _dio.get('/driver/profile');
    return response.data;
  }

  /// GET /api/driver/vehicles
  Future<Map<String, dynamic>> getDriverVehicles() async {
    final response = await _dio.get('/driver/vehicles');
    return response.data;
  }

  /// POST /api/driver/vehicles
  Future<Map<String, dynamic>> addDriverVehicle(String vehicleId) async {
    final response = await _dio.post(
      '/driver/vehicles',
      data: {'vehicle_id': vehicleId},
    );
    return response.data;
  }

  /// GET /api/driver/vehicles/:vehicleId
  Future<Map<String, dynamic>> getDriverVehicleDetails(String vehicleId) async {
    final response = await _dio.get('/driver/vehicles/$vehicleId');
    return response.data;
  }

  /// DELETE /api/driver/vehicles/:vehicleId
  Future<Map<String, dynamic>> removeDriverVehicle(String vehicleId) async {
    final response = await _dio.delete('/driver/vehicles/$vehicleId');
    return response.data;
  }

  /// POST /api/driver/transmit/start
  Future<Map<String, dynamic>> startTransmission(String vehicleId) async {
    final response = await _dio.post(
      '/driver/transmit/start',
      data: {'vehicle_id': vehicleId},
    );
    return response.data;
  }

  /// POST /api/driver/transmit/stop
  Future<Map<String, dynamic>> stopTransmission() async {
    final response = await _dio.post('/driver/transmit/stop');
    return response.data;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Parent APIs
  // ═══════════════════════════════════════════════════════════════════════════

  /// GET /api/parent/schools
  Future<Map<String, dynamic>> getParentSchools() async {
    final response = await _dio.get('/parent/schools');
    return response.data;
  }

  /// GET /api/parent/vehicles?school_id=...
  Future<Map<String, dynamic>> getParentVehicles(String schoolId) async {
    final response = await _dio.get(
      '/parent/vehicles',
      queryParameters: {'school_id': schoolId},
    );
    return response.data;
  }

  /// GET /api/parent/profile
  Future<Map<String, dynamic>> getParentProfile() async {
    final response = await _dio.get('/parent/profile');
    return response.data;
  }

  /// PUT /api/parent/profile
  Future<Map<String, dynamic>> updateParentProfile(
    Map<String, dynamic> payload,
  ) async {
    final response = await _dio.put('/parent/profile', data: payload);
    return response.data;
  }

  /// GET /api/parent/track/:vehicleId
  Future<Map<String, dynamic>> trackVehicle(String vehicleId) async {
    final response = await _dio.get('/parent/track/$vehicleId');
    return response.data;
  }

  /// POST /api/parent/routes
  Future<Map<String, dynamic>> createRoute(Map<String, dynamic> payload) async {
    final response = await _dio.post('/parent/routes', data: payload);
    return response.data;
  }

  /// GET /api/parent/routes
  Future<Map<String, dynamic>> getParentRoutes() async {
    final response = await _dio.get('/parent/routes');
    return response.data;
  }

  /// GET /api/parent/routes/:routeId
  Future<Map<String, dynamic>> getRouteDetail(String routeId) async {
    final response = await _dio.get('/parent/routes/$routeId');
    return response.data;
  }

  /// DELETE /api/parent/routes/:routeId
  Future<Map<String, dynamic>> deleteRoute(String routeId) async {
    final response = await _dio.delete('/parent/routes/$routeId');
    return response.data;
  }

  /// GET /api/parent/slots/search
  Future<Map<String, dynamic>> searchSlot(String slotNo) async {
    final response = await _dio.get(
      '/parent/slots/search',
      queryParameters: {'slot_no': slotNo},
    );
    return response.data;
  }
}
