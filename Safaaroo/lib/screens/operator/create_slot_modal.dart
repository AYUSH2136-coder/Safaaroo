import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../models/school.dart';
import '../../models/service_slot.dart';
import '../../models/vehicle.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';

/// Bottom sheet modal for creating or managing a service slot.
/// When [existingSlot] is provided, we are editing an existing slot.
class CreateSlotModal extends StatefulWidget {
  final VoidCallback onUpdated;
  final List<School> schools;
  final List<Vehicle> vehicles;
  final ServiceSlot? existingSlot;

  const CreateSlotModal({
    super.key,
    required this.onUpdated,
    required this.schools,
    required this.vehicles,
    this.existingSlot,
  });

  @override
  State<CreateSlotModal> createState() => _CreateSlotModalState();
}

class _CreateSlotModalState extends State<CreateSlotModal> {
  final ApiService _api = ApiService();
  late final TextEditingController _slotNameController;
  late final TextEditingController _schoolSearchController;
  late final Set<String> _selectedSchoolIds;
  String? _selectedVehicleId;
  bool _saving = false;
  String? _errorMessage;

  bool get _isEditing => widget.existingSlot != null;

  /// Vehicles available to assign (not already in another slot, or the one currently assigned).
  List<Vehicle> get _availableVehicles {
    return widget.vehicles.where((v) {
      if (v.vehicleId == widget.existingSlot?.vehicleId) return true;
      return v.slotNo == null;
    }).toList();
  }

  @override
  void initState() {
    super.initState();
    _slotNameController = TextEditingController(
      text: widget.existingSlot?.slotName ?? '',
    );
    _schoolSearchController = TextEditingController();
    _schoolSearchController.addListener(() => setState(() {}));
    _selectedSchoolIds = widget.existingSlot?.schoolIds.toSet() ?? {};
    _selectedVehicleId = widget.existingSlot?.vehicleId;
  }

  @override
  void dispose() {
    _slotNameController.dispose();
    _schoolSearchController.dispose();
    super.dispose();
  }

  String _extractError(dynamic e, String fallback) {
    if (e is DioException && e.response?.data is Map) {
      final msg = (e.response!.data as Map)['error'];
      if (msg is String && msg.isNotEmpty) return msg;
    }
    return fallback;
  }

  Future<void> _save() async {
    final name = _slotNameController.text.trim();
    if (name.isEmpty) {
      setState(() => _errorMessage = 'Slot name is required.');
      return;
    }

    setState(() {
      _saving = true;
      _errorMessage = null;
    });
    try {
      final payload = {
        'slot_name': name,
        'vehicle_id': _selectedVehicleId ?? '',
        'school_ids': _selectedSchoolIds.toList(),
      };

      if (_isEditing) {
        await _api.updateSlot(widget.existingSlot!.slotNo, payload);
      } else {
        await _api.createSlot(payload);
      }

      widget.onUpdated();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = _extractError(
            e,
            _isEditing
                ? 'Could not update this slot. Check the bus and driver assignments.'
                : 'Failed to create slot.',
          );
        });
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          12,
          20,
          MediaQuery.of(context).viewInsets.bottom + 20,
        ),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.85,
          ),
          child: Form(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _isEditing
                        ? 'Manage ${widget.existingSlot!.formattedSlotNo}'
                        : 'Create Service Slot',
                    style: Theme.of(context).textTheme.titleLarge,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _isEditing
                        ? 'The slot number stays fixed. Change the name, bus, or schools assigned to this service.'
                        : 'Give this slot a name and optionally assign a bus and schools.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.textSecondary),
                  ),
                  if (_isEditing) ...[
                    const SizedBox(height: 12),
                    _buildInfoRow(Icons.tag, widget.existingSlot!.formattedSlotNo),
                  ],
                  const SizedBox(height: 20),

                  // Slot Name (mandatory)
                  TextFormField(
                    controller: _slotNameController,
                    decoration: const InputDecoration(
                      labelText: 'Slot Name',
                      prefixIcon: Icon(Icons.label_outline),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Assign Vehicle (optional dropdown)
                  DropdownButtonFormField<String?>(
                    initialValue: _selectedVehicleId,
                    decoration: const InputDecoration(
                      labelText: 'Assign Vehicle (optional)',
                      prefixIcon: Icon(Icons.directions_bus_outlined),
                    ),
                    items: [
                      const DropdownMenuItem<String?>(
                        value: null,
                        child: Text('No vehicle assigned'),
                      ),
                      ..._availableVehicles.map((v) => DropdownMenuItem<String?>(
                            value: v.vehicleId,
                            child: Text(v.vehicleId),
                          )),
                    ],
                    onChanged: (value) => setState(() => _selectedVehicleId = value),
                  ),
                  const SizedBox(height: 16),

                  // Schools served (optional)
                  Text(
                    'Schools served (optional)',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 6),
                  if (widget.schools.isEmpty)
                    const Text('No schools are available.')
                  else
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        TextField(
                          controller: _schoolSearchController,
                          decoration: const InputDecoration(
                            labelText: 'Search Schools',
                            prefixIcon: Icon(Icons.search),
                            isDense: true,
                          ),
                        ),
                        const SizedBox(height: 8),
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxHeight: 150),
                          child: Builder(
                            builder: (context) {
                              final query =
                                  _schoolSearchController.text.toLowerCase();
                              final filtered = widget.schools
                                  .where((s) => s.schoolName
                                      .toLowerCase()
                                      .contains(query))
                                  .toList();
                              if (filtered.isEmpty) {
                                return const Center(
                                    child: Padding(
                                  padding: EdgeInsets.all(8.0),
                                  child: Text('No schools found.'),
                                ));
                              }
                              return ListView(
                                shrinkWrap: true,
                                children: filtered.map((school) {
                                  return CheckboxListTile(
                                    dense: true,
                                    contentPadding: EdgeInsets.zero,
                                    value: _selectedSchoolIds
                                        .contains(school.schoolId),
                                    title: Text(school.schoolName),
                                    onChanged: (selected) =>
                                        setState(() {
                                      if (selected == true) {
                                        _selectedSchoolIds.add(school.schoolId);
                                      } else {
                                        _selectedSchoolIds
                                            .remove(school.schoolId);
                                      }
                                    }),
                                  );
                                }).toList(),
                              );
                            },
                          ),
                        ),
                      ],
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
                      onPressed: _saving ? null : _save,
                      child: _saving
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(_isEditing
                              ? 'Save Slot Assignment'
                              : 'Create Service Slot'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildInfoRow(IconData icon, String text) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, size: 14, color: AppColors.textMuted),
        const SizedBox(width: 6),
        Text(
          text,
          style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
        ),
      ],
    );
  }
}
