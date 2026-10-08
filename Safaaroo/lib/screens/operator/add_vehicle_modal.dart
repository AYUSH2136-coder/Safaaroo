import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';

/// Bottom sheet modal for adding a new vehicle (bus).
class AddVehicleModal extends StatefulWidget {
  final VoidCallback onVehicleAdded;

  const AddVehicleModal({
    super.key,
    required this.onVehicleAdded,
  });

  @override
  State<AddVehicleModal> createState() => _AddVehicleModalState();
}

class _AddVehicleModalState extends State<AddVehicleModal> {
  final _formKey = GlobalKey<FormState>();
  final _vehicleIdController = TextEditingController();

  final ApiService _api = ApiService();

  bool _submitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    _vehicleIdController.dispose();
    super.dispose();
  }

  String _extractError(dynamic e, String fallback) {
    if (e is DioException && e.response?.data is Map) {
      final msg = (e.response!.data as Map)['error'];
      if (msg is String && msg.isNotEmpty) return msg;
    }
    return fallback;
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _errorMessage = null;
    });
    try {
      await _api.addVehicle({
        'vehicle_id': _vehicleIdController.text.trim().toUpperCase(),
      });

      widget.onVehicleAdded();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = _extractError(e, 'Failed to add vehicle');
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
              'Register Bus',
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),

            TextFormField(
              controller: _vehicleIdController,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(
                labelText: 'Vehicle Number (e.g. KA-01-AB-1234)',
                prefixIcon: Icon(Icons.directions_bus_outlined),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
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

            const SizedBox(height: 24),

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
                    : const Text('Register Bus'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
