import 'package:flutter/material.dart';
import '../../models/school.dart';
import '../../services/api_service.dart';
import '../../services/location_service.dart';
import '../../theme/app_theme.dart';
import '../operator/pinpoint_location_modal.dart';

class AddRouteModal extends StatefulWidget {
  final VoidCallback onRouteAdded;

  const AddRouteModal({super.key, required this.onRouteAdded});

  @override
  State<AddRouteModal> createState() => _AddRouteModalState();
}

class _AddRouteModalState extends State<AddRouteModal> {
  final ApiService _api = ApiService();
  final LocationService _location = LocationService();
  final _formKey = GlobalKey<FormState>();

  bool _loading = true;
  bool _saving = false;
  bool _searchingSlot = false;

  List<School> _schools = [];

  // Form values
  final _routeNameController = TextEditingController();
  final _slotSearchController = TextEditingController();
  final _schoolSearchController = TextEditingController();
  final _pickupNameController = TextEditingController();

  // School state — can be a DB school or custom
  String? _selectedSchoolId; // set if a global school is picked
  String? _customSchoolName; // set if parent typed a custom name
  double? _customSchoolLat;
  double? _customSchoolLng;

  // Slot Search state
  int? _resolvedSlotNo;
  String? _resolvedSlotName;
  String? _slotSearchError;

  // Pickup location
  double? _pickupLat;
  double? _pickupLng;
  bool _detectingGps = false;

  final String _notifyPref = 'none';

  @override
  void initState() {
    super.initState();
    _loadSchools();
  }

  @override
  void dispose() {
    _routeNameController.dispose();
    _slotSearchController.dispose();
    _schoolSearchController.dispose();
    _pickupNameController.dispose();
    super.dispose();
  }

  Future<void> _loadSchools() async {
    try {
      final data = await _api.getParentSchools();
      setState(() {
        _schools = (data['schools'] as List)
            .map((s) => School.fromJson(s))
            .toList();
      });
    } catch (e) {
      // Schools are optional — parent can type a custom name
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _searchSlot(String query) async {
    if (query.isEmpty) {
      setState(() {
        _resolvedSlotNo = null;
        _resolvedSlotName = null;
        _slotSearchError = null;
      });
      return;
    }

    setState(() {
      _searchingSlot = true;
      _slotSearchError = null;
    });

    try {
      final data = await _api.searchSlot(query);
      if (data['found'] == true) {
        setState(() {
          _resolvedSlotNo = data['slot']['slot_no'];
          _resolvedSlotName = data['slot']['slot_name'];
          _slotSearchError = null;
        });
      } else {
        setState(() {
          _resolvedSlotNo = null;
          _resolvedSlotName = null;
          _slotSearchError = 'There is no slot of this number';
        });
      }
    } catch (e) {
      setState(() {
        _resolvedSlotNo = null;
        _resolvedSlotName = null;
        _slotSearchError = 'Error searching for slot';
      });
    } finally {
      if (mounted) setState(() => _searchingSlot = false);
    }
  }

  Future<void> _detectCurrentLocation() async {
    setState(() => _detectingGps = true);
    try {
      final position = await _location.getCurrentPosition();
      if (position != null && mounted) {
        setState(() {
          _pickupLat = position.latitude;
          _pickupLng = position.longitude;
        });
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to get location')),
        );
      }
    } finally {
      if (mounted) setState(() => _detectingGps = false);
    }
  }

  void _openPinpointForSchool() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PinpointLocationModal(
          existingSchools: _schools,
          initialSearchQuery: _schoolSearchController.text,
          onLocationSelected: (place) {
            setState(() {
              _customSchoolName = place.name;
              _customSchoolLat = place.latitude;
              _customSchoolLng = place.longitude;
              _selectedSchoolId = null; // Custom overrides global
              _schoolSearchController.text = place.name;
            });
          },
        ),
      ),
    );
  }

  void _openPinpointForPickup() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PinpointLocationModal(
          existingSchools: const [],
          initialSearchQuery: _pickupNameController.text,
          onLocationSelected: (place) {
            setState(() {
              _pickupLat = place.latitude;
              _pickupLng = place.longitude;
              if (_pickupNameController.text.trim().isEmpty) {
                _pickupNameController.text = place.name;
              }
            });
          },
        ),
      ),
    );
  }

  Future<void> _saveRoute() async {
    if (!_formKey.currentState!.validate()) return;

    if (_resolvedSlotNo == null) {
      setState(() => _slotSearchError = 'Please search and select a valid slot.');
      return;
    }

    setState(() => _saving = true);
    try {
      await _api.createRoute({
        'route_name': _routeNameController.text.trim(),
        'school_id': _selectedSchoolId,
        'custom_school_name': _customSchoolName ?? _schoolSearchController.text.trim(),
        'custom_school_lat': _customSchoolLat,
        'custom_school_lng': _customSchoolLng,
        'slot_no': _resolvedSlotNo,
        'home_lat': _pickupLat,
        'home_lng': _pickupLng,
        'pickup_name': _pickupNameController.text.trim().isNotEmpty
            ? _pickupNameController.text.trim()
            : null,
        'notify_pref': _notifyPref,
      });

      if (mounted) {
        widget.onRouteAdded();
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Route created successfully!'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        String msg = 'Failed to create route';
        if (e.toString().contains('slot')) {
          msg = 'Service slot not found.';
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg)),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const SizedBox(
        height: 200,
        child: Center(child: CircularProgressIndicator()),
      );
    }

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
        top: 24,
      ),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Add New Route',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 24),

              // ── Route Name ──────────────────────────────────
              TextFormField(
                controller: _routeNameController,
                decoration: const InputDecoration(
                  labelText: 'Route Name',
                  hintText: 'e.g. Morning Pickup',
                ),
                validator: (val) =>
                    val == null || val.trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 16),

              // ── School (Search-Dropdown + Pinpoint) ─────────
              Autocomplete<School>(
                optionsBuilder: (TextEditingValue textEditingValue) {
                  if (textEditingValue.text.isEmpty) {
                    return const Iterable<School>.empty();
                  }
                  return _schools.where((s) => s.schoolName
                      .toLowerCase()
                      .contains(textEditingValue.text.toLowerCase()));
                },
                displayStringForOption: (School s) => s.schoolName,
                fieldViewBuilder:
                    (context, controller, focusNode, onFieldSubmitted) {
                  // Sync the controllers
                  if (_schoolSearchController.text.isNotEmpty &&
                      controller.text.isEmpty) {
                    controller.text = _schoolSearchController.text;
                  }
                  return TextFormField(
                    controller: controller,
                    focusNode: focusNode,
                    decoration: InputDecoration(
                      labelText: 'School / Institute Name',
                      hintText: 'Search or type your school name',
                      suffixIcon: IconButton(
                        icon: const Icon(Icons.pin_drop_outlined),
                        tooltip: 'Pinpoint School Location',
                        onPressed: () {
                          _schoolSearchController.text = controller.text;
                          _openPinpointForSchool();
                        },
                      ),
                    ),
                    onChanged: (val) {
                      _schoolSearchController.text = val;
                      // If user types custom text, clear the selected global school
                      _selectedSchoolId = null;
                      _customSchoolName = val.trim();
                    },
                  );
                },
                onSelected: (School selection) {
                  setState(() {
                    _selectedSchoolId = selection.schoolId;
                    _customSchoolName = selection.schoolName;
                    _customSchoolLat = selection.latitude;
                    _customSchoolLng = selection.longitude;
                    _schoolSearchController.text = selection.schoolName;
                  });
                },
                optionsViewBuilder: (context, onSelected, options) {
                  return Align(
                    alignment: Alignment.topLeft,
                    child: Material(
                      elevation: 4,
                      borderRadius: BorderRadius.circular(8),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxHeight: 200),
                        child: ListView.builder(
                          padding: EdgeInsets.zero,
                          shrinkWrap: true,
                          itemCount: options.length,
                          itemBuilder: (context, index) {
                            final school = options.elementAt(index);
                            return ListTile(
                              leading: const Icon(Icons.school,
                                  color: AppColors.primary, size: 20),
                              title: Text(school.schoolName),
                              dense: true,
                              onTap: () => onSelected(school),
                            );
                          },
                        ),
                      ),
                    ),
                  );
                },
              ),
              if (_customSchoolLat != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8, left: 12),
                  child: Row(
                    children: [
                      const Icon(Icons.check_circle,
                          color: AppColors.success, size: 16),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Location set for ${_customSchoolName ?? 'school'}',
                          style: const TextStyle(
                              color: AppColors.success,
                              fontSize: 12,
                              fontWeight: FontWeight.w500),
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 16),

              // ── Slot Search ─────────────────────────────────
              TextFormField(
                controller: _slotSearchController,
                decoration: InputDecoration(
                  labelText: 'Search Slot Number',
                  hintText: 'Enter slot number (e.g. 1)',
                  suffixIcon: _searchingSlot
                      ? const Padding(
                          padding: EdgeInsets.all(12.0),
                          child: SizedBox(
                            width: 16,
                            height: 16,
                            child:
                                CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      : IconButton(
                          icon: const Icon(Icons.search),
                          onPressed: () =>
                              _searchSlot(_slotSearchController.text.trim()),
                        ),
                ),
                keyboardType: TextInputType.number,
                onFieldSubmitted: (val) => _searchSlot(val.trim()),
              ),
              if (_slotSearchError != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8, left: 12),
                  child: Text(
                    _slotSearchError!,
                    style: const TextStyle(
                        color: AppColors.error, fontSize: 12),
                  ),
                ),
              if (_resolvedSlotName != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8, left: 12),
                  child: Text(
                    '✅ $_resolvedSlotName',
                    style: const TextStyle(
                        color: AppColors.success,
                        fontSize: 14,
                        fontWeight: FontWeight.w600),
                  ),
                ),
              const SizedBox(height: 20),

              // ── Set Pickup Location ─────────────────────────
              TextFormField(
                controller: _pickupNameController,
                decoration: const InputDecoration(
                  labelText: 'Pickup Location Name (Optional)',
                  hintText: 'e.g. Main Gate, Near Temple',
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _detectingGps ? null : _detectCurrentLocation,
                      icon: _detectingGps
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Icon(
                              _pickupLat == null
                                  ? Icons.my_location
                                  : Icons.check_circle,
                              color: _pickupLat == null
                                  ? null
                                  : AppColors.success,
                              size: 18,
                            ),
                      label: Text(
                        _detectingGps
                            ? 'Detecting...'
                            : (_pickupLat == null
                                ? 'Current Location'
                                : 'Location Set'),
                        style: const TextStyle(fontSize: 13),
                      ),
                      style: OutlinedButton.styleFrom(
                        side: BorderSide(
                          color: _pickupLat == null
                              ? AppColors.primary
                              : AppColors.success,
                          width: 1.5,
                        ),
                        foregroundColor: _pickupLat == null
                            ? AppColors.primary
                            : AppColors.success,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _openPinpointForPickup,
                      icon: const Icon(Icons.pin_drop_outlined, size: 18),
                      label: const Text('Pinpoint on Map',
                          style: TextStyle(fontSize: 13)),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // ── Create Button ───────────────────────────────
              ElevatedButton(
                onPressed: _saving ? null : _saveRoute,
                child: _saving
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Create Route'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
