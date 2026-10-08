import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import '../../models/school.dart';
import '../../services/api_service.dart';
import '../../services/location_service.dart';
import '../../services/mapbox_service.dart';
import '../../theme/app_theme.dart';
import 'pinpoint_location_modal.dart';

/// Bottom sheet modal for adding a new school.
/// Supports GPS-based coordinate detection and Mapbox-based pinpoint selection.
class AddSchoolModal extends StatefulWidget {
  final VoidCallback onSchoolAdded;
  final List<School> existingSchools;
  final School? initialSchool;

  const AddSchoolModal({
    super.key,
    required this.onSchoolAdded,
    required this.existingSchools,
    this.initialSchool,
  });

  @override
  State<AddSchoolModal> createState() => _AddSchoolModalState();
}

class _AddSchoolModalState extends State<AddSchoolModal> {
  final _formKey = GlobalKey<FormState>();
  final _schoolNameController = TextEditingController();
  final _latController = TextEditingController();
  final _lngController = TextEditingController();
  final _addressController = TextEditingController();

  final ApiService _api = ApiService();
  final LocationService _location = LocationService();

  bool _submitting = false;
  bool _detectingGps = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    if (widget.initialSchool != null) {
      _schoolNameController.text = widget.initialSchool!.schoolName;
      _latController.text = widget.initialSchool!.latitude.toStringAsFixed(6);
      _lngController.text = widget.initialSchool!.longitude.toStringAsFixed(6);
      _addressController.text = widget.initialSchool!.address ?? '';
    }
  }

  @override
  void dispose() {
    _schoolNameController.dispose();
    _latController.dispose();
    _lngController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  String _extractError(dynamic e, String fallback) {
    if (e is DioException && e.response?.data is Map) {
      final msg = (e.response!.data as Map)['error'];
      if (msg is String && msg.isNotEmpty) return msg;
    }
    return fallback;
  }

  Future<void> _detectLocation() async {
    setState(() {
      _detectingGps = true;
      _errorMessage = null;
    });
    try {
      final position = await _location.getCurrentPosition();
      if (position != null && mounted) {
        _latController.text = position.latitude.toStringAsFixed(6);
        _lngController.text = position.longitude.toStringAsFixed(6);
      } else if (mounted) {
        setState(() => _errorMessage = 'Location permission denied');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _errorMessage = 'Failed to get location');
      }
    }
    if (mounted) setState(() => _detectingGps = false);
  }

  void _onPinpointSelected(PlaceResult place) {
    setState(() {
      _latController.text = place.latitude.toStringAsFixed(6);
      _lngController.text = place.longitude.toStringAsFixed(6);
      _addressController.text = place.fullAddress;
    });
  }

  Future<void> _openPinpointModal() async {
    final latitude = double.tryParse(_latController.text);
    final longitude = double.tryParse(_lngController.text);
    final initialCenter = latitude != null && longitude != null
        ? Point(coordinates: Position(longitude, latitude))
        : null;

    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => PinpointLocationModal(
          existingSchools: widget.existingSchools,
          initialSearchQuery: _schoolNameController.text.trim(),
          initialCenter: initialCenter,
          onLocationSelected: _onPinpointSelected,
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _submitting = true;
      _errorMessage = null;
    });
    try {
      final payload = {
        'school_name': _schoolNameController.text.trim(),
        'latitude': double.parse(_latController.text.trim()),
        'longitude': double.parse(_lngController.text.trim()),
        'address': _addressController.text.trim().isEmpty
            ? null
            : _addressController.text.trim(),
      };

      if (widget.initialSchool != null) {
        await _api.updateSchool(widget.initialSchool!.schoolId, payload);
      } else {
        await _api.addSchool(payload);
      }

      widget.onSchoolAdded();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = _extractError(
            e,
            widget.initialSchool != null
                ? 'Failed to update school'
                : 'Failed to add school',
          );
        });
      }
    }
    if (mounted) setState(() => _submitting = false);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 8,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.initialSchool != null ? 'Update School' : 'Add School',
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),

            TextFormField(
              controller: _schoolNameController,
              decoration: const InputDecoration(
                labelText: 'School Name',
                prefixIcon: Icon(Icons.school_outlined),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 14),

            // GPS coordinates row
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _latController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Latitude'),
                    validator: (v) =>
                        (v == null || v.trim().isEmpty) ? 'Required' : null,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextFormField(
                    controller: _lngController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Longitude'),
                    validator: (v) =>
                        (v == null || v.trim().isEmpty) ? 'Required' : null,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // GPS buttons row
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _detectingGps ? null : _detectLocation,
                    icon: _detectingGps
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.my_location, size: 18),
                    label: Text(
                      _detectingGps ? 'Detecting…' : 'Use Current Location',
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _openPinpointModal,
                    icon: const Icon(Icons.map_outlined, size: 18),
                    label: const Text('Pinpoint Location'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.primary,
                      side: BorderSide(color: AppColors.primary),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            TextFormField(
              controller: _addressController,
              decoration: const InputDecoration(
                labelText: 'Address (optional)',
                prefixIcon: Icon(Icons.location_on_outlined),
              ),
              maxLines: 2,
            ),

            // Inline error banner
            if (_errorMessage != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.errorLight,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.error.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline, size: 18, color: AppColors.error),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _errorMessage!,
                        style: const TextStyle(color: AppColors.error, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 20),

            SizedBox(
              height: 48,
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: Colors.white,
                        ),
                      )
                    : Text(widget.initialSchool != null ? 'Update School' : 'Add School'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
