import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';

/// Wrapper for Mapbox Geocoding API (forward + reverse geocoding).
class MapboxService {
  MapboxService._();
  static final MapboxService instance = MapboxService._();

  static const String _baseUrl = 'api.mapbox.com';
  static const String _geocodingPath = '/geocoding/v5/mapbox.places';
  static const String _accessToken = AppConfig.mapboxAccessToken;

  /// Forward geocode: search places by query string.
  /// Returns list of PlaceResult with name, address, coordinates.
  Future<List<PlaceResult>> searchPlaces(
    String query, {
    double? proximityLat,
    double? proximityLng,
    int limit = 5,
  }) async {
    if (query.trim().isEmpty) return [];

    final params = {
      'access_token': _accessToken,
      'limit': limit.toString(),
      'types': 'poi,address,place',
      'language': 'en',
    };

    if (proximityLat != null && proximityLng != null) {
      params['proximity'] = '$proximityLng,$proximityLat';
    }

    final uri = Uri(
      scheme: 'https',
      host: _baseUrl,
      pathSegments: [
        'geocoding',
        'v5',
        'mapbox.places',
        '${query.trim()}.json',
      ],
      queryParameters: params,
    );
    final response = await http.get(uri);

    if (response.statusCode != 200) {
      throw Exception('Mapbox search failed: ${response.statusCode}');
    }

    final data = json.decode(response.body);
    final features = data['features'] as List<dynamic>? ?? [];

    return features.map((f) => PlaceResult.fromMapbox(f)).toList();
  }

  /// Reverse geocode: get place name from coordinates.
  Future<PlaceResult?> reverseGeocode(double lat, double lng) async {
    final params = {
      'access_token': _accessToken,
      'limit': '1',
      'types': 'poi,address,place',
    };

    final uri = Uri.https(_baseUrl, '$_geocodingPath/$lng,$lat.json', params);
    final response = await http.get(uri);

    if (response.statusCode != 200) return null;

    final data = json.decode(response.body);
    final features = data['features'] as List<dynamic>? ?? [];

    return features.isNotEmpty ? PlaceResult.fromMapbox(features.first) : null;
  }
}

/// Normalized place result from Mapbox.
class PlaceResult {
  final String id;
  final String name;
  final String fullAddress;
  final double latitude;
  final double longitude;
  final Map<String, dynamic> raw;

  PlaceResult({
    required this.id,
    required this.name,
    required this.fullAddress,
    required this.latitude,
    required this.longitude,
    required this.raw,
  });

  factory PlaceResult.fromMapbox(Map<String, dynamic> feature) {
    final coords = feature['geometry']['coordinates'] as List;
    final lng = (coords[0] as num).toDouble();
    final lat = (coords[1] as num).toDouble();

    return PlaceResult(
      id: feature['id'] ?? '',
      name: feature['text'] ?? '',
      fullAddress: feature['place_name'] ?? '',
      latitude: lat,
      longitude: lng,
      raw: feature,
    );
  }
}
