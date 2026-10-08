// ignore_for_file: deprecated_member_use
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import '../../config/app_config.dart';
import '../../models/school.dart';
import '../../services/mapbox_service.dart';
import '../../theme/app_theme.dart';

class PinpointLocationModal extends StatefulWidget {
  final List<School> existingSchools;
  final String initialSearchQuery;
  final Point? initialCenter;
  final Function(PlaceResult) onLocationSelected;

  const PinpointLocationModal({
    super.key,
    required this.existingSchools,
    required this.onLocationSelected,
    this.initialSearchQuery = '',
    this.initialCenter,
  });

  @override
  State<PinpointLocationModal> createState() => _PinpointLocationModalState();
}

class _PinpointLocationModalState extends State<PinpointLocationModal> {
  MapboxMap? _mapboxMap;
  PointAnnotationManager? _pointAnnotationManager;
  final MapboxService _mapbox = MapboxService.instance;
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocus = FocusNode();

  List<PlaceResult> _searchResults = [];
  bool _searching = false;
  bool _searchCompleted = false;
  String? _searchError;
  PlaceResult? _selectedPlace;
  Point? _pinnedLocation;
  Timer? _debounceTimer;

  @override
  void initState() {
    super.initState();
    _searchController.text = widget.initialSearchQuery;
    if (widget.initialSearchQuery.isNotEmpty) {
      _searchPlaces(widget.initialSearchQuery);
    }
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _searchController.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  Future<void> _onMapCreated(MapboxMap mapboxMap) async {
    _mapboxMap = mapboxMap;
    await mapboxMap.loadStyleURI(AppConfig.mapboxStyleUrl);
    _pointAnnotationManager = await mapboxMap.annotations
        .createPointAnnotationManager();
    _addExistingSchoolMarkers();
    final center =
        widget.initialCenter ?? Point(coordinates: Position(77.4126, 23.2599));
    await mapboxMap.setCamera(CameraOptions(center: center, zoom: 14.0));
  }

  void _onMapClick(MapContentGestureContext context) {
    _handleMapTap(context.point);
  }

  Future<void> _handleMapTap(Point point) async {
    await _dropPin(point);
    await _reverseGeocode(point);
  }

  Future<void> _dropPin(Point coordinate, {PlaceResult? selectedPlace}) async {
    await _pointAnnotationManager?.deleteAll();
    _addExistingSchoolMarkers();
    await _pointAnnotationManager?.create(
      PointAnnotationOptions(
        geometry: coordinate,
        iconSize: 1.5,
        textField: '●',
        textSize: 24,
        textColor: Colors.red.toARGB32(),
        textHaloColor: Colors.white.toARGB32(),
        textHaloWidth: 2,
      ),
    );
    _pinnedLocation = coordinate;
    _selectedPlace = selectedPlace;
    if (mounted) setState(() {});
  }

  Future<void> _reverseGeocode(Point coordinate) async {
    try {
      final place = await _mapbox.reverseGeocode(
        coordinate.coordinates.lat.toDouble(),
        coordinate.coordinates.lng.toDouble(),
      );
      if (place != null &&
          mounted &&
          _pinnedLocation?.coordinates.lat == coordinate.coordinates.lat &&
          _pinnedLocation?.coordinates.lng == coordinate.coordinates.lng) {
        setState(() {
          _selectedPlace = PlaceResult(
            id: place.id,
            name: place.name,
            fullAddress: place.fullAddress,
            latitude: coordinate.coordinates.lat.toDouble(),
            longitude: coordinate.coordinates.lng.toDouble(),
            raw: place.raw,
          );
        });
      }
    } catch (_) {}
  }

  Future<void> _addExistingSchoolMarkers() async {
    for (final school in widget.existingSchools) {
      await _pointAnnotationManager?.create(
        PointAnnotationOptions(
          geometry: Point(
            coordinates: Position(school.longitude, school.latitude),
          ),
          iconSize: 1.2,
          textField: '● ${school.schoolName}',
          textSize: 12.0,
          textColor: Colors.blue.toARGB32(),
          textHaloColor: Colors.white.toARGB32(),
          textHaloWidth: 2.0,
          textAnchor: TextAnchor.TOP,
          textOffset: [0.0, 1.5],
        ),
      );
    }
  }

  void _onSearchChanged(String query) {
    _debounceTimer?.cancel();
    setState(() {
      _searchResults = [];
      _searching = query.trim().isNotEmpty;
      _searchCompleted = false;
      _searchError = null;
    });
    _debounceTimer = Timer(const Duration(milliseconds: 300), () {
      _searchPlaces(query);
    });
  }

  Future<void> _searchPlaces(String query) async {
    if (query.trim().isEmpty) {
      setState(() {
        _searchResults = [];
        _searching = false;
        _searchCompleted = false;
        _searchError = null;
      });
      return;
    }
    setState(() {
      _searching = true;
      _searchError = null;
    });
    try {
      final results = await _mapbox.searchPlaces(
        query,
        proximityLat:
            _pinnedLocation?.coordinates.lat.toDouble() ??
            widget.initialCenter?.coordinates.lat.toDouble(),
        proximityLng:
            _pinnedLocation?.coordinates.lng.toDouble() ??
            widget.initialCenter?.coordinates.lng.toDouble(),
      );
      if (mounted) setState(() => _searchResults = results);
    } catch (_) {
      if (mounted) {
        setState(() {
          _searchResults = [];
          _searchError =
              'Search unavailable. Check your connection and try again.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _searching = false;
          _searchCompleted = true;
        });
      }
    }
  }

  Future<void> _onResultTap(PlaceResult place) async {
    setState(() {
      _selectedPlace = place;
      _searchResults = [];
      _searchController.text = place.fullAddress;
    });
    final coordinate = Point(
      coordinates: Position(place.longitude, place.latitude),
    );
    await _mapboxMap?.flyTo(
      CameraOptions(center: coordinate, zoom: 16.0),
      MapAnimationOptions(duration: 500),
    );
    await _dropPin(coordinate, selectedPlace: place);
  }

  void _confirmSelection() {
    if (_selectedPlace != null) {
      widget.onLocationSelected(_selectedPlace!);
      Navigator.pop(context);
    } else if (_pinnedLocation != null) {
      widget.onLocationSelected(
        PlaceResult(
          id: 'pinned',
          name: 'Pinned Location',
          fullAddress: 'Selected on map',
          latitude: _pinnedLocation!.coordinates.lat.toDouble(),
          longitude: _pinnedLocation!.coordinates.lng.toDouble(),
          raw: {},
        ),
      );
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Pinpoint Location'),
        backgroundColor: AppColors.surface,
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          TextButton(
            onPressed: (_selectedPlace != null || _pinnedLocation != null)
                ? _confirmSelection
                : null,
            child: Text(
              'Use This',
              style: TextStyle(
                color: (_selectedPlace != null || _pinnedLocation != null)
                    ? AppColors.primary
                    : AppColors.textMuted,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchController,
              focusNode: _searchFocus,
              decoration: InputDecoration(
                hintText: 'Search school or address...',
                prefixIcon: _searching
                    ? const Padding(
                        padding: EdgeInsets.all(12),
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.search),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchController.clear();
                          _onSearchChanged('');
                        },
                      )
                    : null,
                filled: true,
                fillColor: AppColors.surfaceVariant,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
              onChanged: _onSearchChanged,
              autofocus: true,
            ),
          ),
          if (_searchResults.isNotEmpty)
            Container(
              height: 200,
              margin: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: AppColors.surfaceVariant,
                borderRadius: BorderRadius.circular(12),
              ),
              child: ListView.builder(
                itemCount: _searchResults.length,
                itemBuilder: (_, i) => ListTile(
                  leading: const Icon(
                    Icons.location_on,
                    color: AppColors.primary,
                  ),
                  title: Text(
                    _searchResults[i].name,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  subtitle: Text(
                    _searchResults[i].fullAddress,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  onTap: () => _onResultTap(_searchResults[i]),
                ),
              ),
            ),
          if (_searchCompleted && _searchResults.isEmpty)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.symmetric(horizontal: 16),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.surfaceVariant,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                _searchError ?? 'No places found',
                style: TextStyle(color: AppColors.textSecondary),
              ),
            ),
          Expanded(
            child: MapWidget(
              key: const ValueKey('pinpoint-map'),
              onMapCreated: _onMapCreated,
              onTapListener: _onMapClick,
              cameraOptions: CameraOptions(
                center:
                    widget.initialCenter ??
                    Point(coordinates: Position(77.4126, 23.2599)),
                zoom: 14.0,
              ),
            ),
          ),
          if (_selectedPlace != null || _pinnedLocation != null)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.surfaceVariant,
                border: Border(top: BorderSide(color: AppColors.border)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.check_circle, color: AppColors.success),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _selectedPlace?.name ?? 'Pinned Location',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        Text(
                          _selectedPlace?.fullAddress ??
                              'Lat: ${_pinnedLocation!.coordinates.lat.toStringAsFixed(6)}, Lng: ${_pinnedLocation!.coordinates.lng.toStringAsFixed(6)}',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  TextButton(
                    onPressed: _confirmSelection,
                    child: const Text(
                      'Confirm',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
