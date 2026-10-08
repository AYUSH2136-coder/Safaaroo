import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/app_config.dart';
import '../models/user.dart';
import '../services/api_service.dart';
import '../services/socket_service.dart';

/// Central authentication state — mirrors `AuthContext.jsx` from the web app.
///
/// Manages JWT token persistence, user state, and role-based access.
/// Uses `flutter_secure_storage` instead of the web's `localStorage`.
class AuthProvider extends ChangeNotifier {
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  final ApiService _api = ApiService();

  User? _user;
  String? _token;
  bool _isLoading = true;
  String? _error;

  // ── Getters ─────────────────────────────────────────────────────────────
  User? get user => _user;
  String? get token => _token;
  bool get isLoading => _isLoading;
  bool get isAuthenticated => _token != null && _user != null;
  String? get role => _user?.role;
  String? get error => _error;

  /// Called once at app startup from `main.dart`.
  /// Checks if a saved auth session exists and restores it.
  Future<void> checkSavedAuth() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final savedToken = await _storage.read(key: AppConfig.authTokenKey);
      final savedUserJson = await _storage.read(key: AppConfig.authUserKey);

      if (savedToken != null && savedUserJson != null) {
        _token = savedToken;
        _user = User.fromJson(jsonDecode(savedUserJson));

        // Validate token with backend
        try {
          final data = await _api.getMe();
          _user = User.fromJson(data['user']);
        } catch (_) {
          // Token expired or invalid — clear and force re-login
          await _clearAuth();
        }
      }
    } catch (_) {
      await _clearAuth();
    }

    _isLoading = false;
    notifyListeners();
  }

  /// Logs in with mobile + password.
  /// On success: stores JWT, user, and navigates to role dashboard.
  Future<bool> login(String mobile, String password) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final data = await _api.login(mobile, password);
      _token = data['token'] as String;
      _user = User.fromJson(data['user']);

      // Persist to secure storage
      await _storage.write(key: AppConfig.authTokenKey, value: _token);
      await _storage.write(
        key: AppConfig.authUserKey,
        value: jsonEncode(_user!.toJson()),
      );

      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = _extractErrorMessage(e);
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  /// Registers a new user.
  /// [payload] shape: { name, mobile, password, role, student_name?, vehicle_id?, is_under_operator? }
  Future<bool> register(Map<String, dynamic> payload) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final data = await _api.register(payload);
      _token = data['token'] as String;
      _user = User.fromJson(data['user']);

      // Persist to secure storage
      await _storage.write(key: AppConfig.authTokenKey, value: _token);
      await _storage.write(
        key: AppConfig.authUserKey,
        value: jsonEncode(_user!.toJson()),
      );

      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = _extractErrorMessage(e);
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  /// Logs out: clears all stored auth, disconnects socket.
  Future<void> logout() async {
    await _clearAuth();
    SocketService().dispose();
    notifyListeners();
  }

  /// Clears the error message.
  void clearError() {
    _error = null;
    notifyListeners();
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  Future<void> _clearAuth() async {
    _token = null;
    _user = null;
    await _storage.delete(key: AppConfig.authTokenKey);
    await _storage.delete(key: AppConfig.authUserKey);
  }

  String _extractErrorMessage(dynamic error) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map && data.containsKey('error')) {
        return data['error'] as String;
      }
      if (error.type == DioExceptionType.connectionTimeout ||
          error.type == DioExceptionType.receiveTimeout) {
        return 'Connection timed out. Is the server running?';
      }
      if (error.type == DioExceptionType.connectionError) {
        return 'Cannot reach the server. Check your network connection.';
      }
      return 'Something went wrong. Please try again.';
    }
    return error.toString();
  }
}
