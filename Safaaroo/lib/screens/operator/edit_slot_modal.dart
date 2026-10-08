import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../models/school.dart';
import '../../models/vehicle.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';

class EditSlotModal extends StatefulWidget {
  final Vehicle vehicle;
  final List<School> schools;
  final VoidCallback onUpdated;

  const EditSlotModal({
    super.key,
    required this.vehicle,
    required this.schools,
    required this.onUpdated,
  });

  @override
  State<EditSlotModal> createState() => _EditSlotModalState();
}

class _EditSlotModalState extends State<EditSlotModal> {
  final ApiService _api = ApiService();
  late final TextEditingController _vehicleIdController;
  late final TextEditingController _vehicleNameController;
  late final TextEditingController _schoolSearchController;
  late final Set<String> _selectedSchoolIds;
  bool _saving = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _vehicleIdController = TextEditingController(
      text: widget.vehicle.vehicleId,
    );
    _vehicleNameController = TextEditingController(
      text: widget.vehicle.vehicleName ?? '',
    );
    _schoolSearchController = TextEditingController();
    _schoolSearchController.addListener(() {
      setState(() {});
    });
    _selectedSchoolIds = widget.vehicle.schoolIds.toSet();
    if (_selectedSchoolIds.isEmpty && widget.vehicle.schoolId != null) {
      _selectedSchoolIds.add(widget.vehicle.schoolId!);
    }
  }

  @override
  void dispose() {
    _vehicleIdController.dispose();
    _vehicleNameController.dispose();
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
    if (_vehicleIdController.text.trim().isEmpty ||
        _selectedSchoolIds.isEmpty) {
      setState(() {
        _errorMessage = 'Enter a bus number and select at least one school.';
      });
      return;
    }

    setState(() {
      _saving = true;
      _errorMessage = null;
    });
    try {
      final payload = {
        'vehicle_id': _vehicleIdController.text.trim().toUpperCase(),
        'vehicle_name': _vehicleNameController.text.trim().isEmpty
            ? null
            : _vehicleNameController.text.trim(),
        'school_ids': _selectedSchoolIds.toList(),
      };
      if (widget.vehicle.slotNo == null) {
        await _api.createSlot(payload);
      } else {
        await _api.updateSlot(widget.vehicle.slotNo!, payload);
      }
      widget.onUpdated();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = _extractError(
            e,
            'Could not update this slot. Check the bus and driver assignments.',
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
                    'Edit ${widget.vehicle.formattedSlotNo}',
                    style: Theme.of(context).textTheme.titleLarge,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    widget.vehicle.slotNo == null
                        ? 'Assign this registered bus to a new service slot and choose its schools.'
                        : 'The slot number stays fixed. Change the bus or schools assigned to this service.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.textSecondary),
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: _vehicleIdController,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(
                      labelText: 'Assigned Bus Number',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _vehicleNameController,
                    decoration: const InputDecoration(
                      labelText: 'Bus Name (optional)',
                    ),
                  ),
                  const SizedBox(height: 12),
                  const SizedBox(height: 4),
                  Text(
                    'Schools served',
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
                              final query = _schoolSearchController.text.toLowerCase();
                              final filtered = widget.schools.where((s) => s.schoolName.toLowerCase().contains(query)).toList();
                              if (filtered.isEmpty) {
                                return const Center(child: Padding(
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
                                    value: _selectedSchoolIds.contains(school.schoolId),
                                    title: Text(school.schoolName),
                                    onChanged: (selected) => setState(() {
                                      if (selected == true) {
                                        _selectedSchoolIds.add(school.schoolId);
                                      } else {
                                        _selectedSchoolIds.remove(school.schoolId);
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
                            : Text(widget.vehicle.slotNo == null
                              ? 'Create Service Slot'
                              : 'Save Slot Assignment'),
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
}
