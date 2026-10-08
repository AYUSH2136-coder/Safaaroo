import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import 'driver_vehicle_detail_screen.dart';

class DriverVehicleListScreen extends StatefulWidget {
  const DriverVehicleListScreen({super.key});

  @override
  State<DriverVehicleListScreen> createState() => _DriverVehicleListScreenState();
}

class _DriverVehicleListScreenState extends State<DriverVehicleListScreen> {
  final ApiService _api = ApiService();
  List<Map<String, dynamic>> _vehicles = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadVehicles();
  }

  Future<void> _loadVehicles() async {
    setState(() => _loading = true);
    try {
      final response = await _api.getDriverVehicles();
      final rows = response['vehicles'] as List<dynamic>? ?? const [];
      _vehicles = rows.map((row) => Map<String, dynamic>.from(row as Map)).toList();
    } catch (_) {
      _showMessage('Could not load your vehicles. Check your connection and retry.');
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _addVehicle() async {
    final controller = TextEditingController();
    bool isAdding = false;
    String? errorText;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => StatefulBuilder(
        builder: (setStateContext, setDialogState) {
          return AlertDialog(
            title: const Text('Add a vehicle'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: controller,
                  enabled: !isAdding,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(labelText: 'Vehicle number'),
                ),
                if (errorText != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppColors.errorLight,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.error.withValues(alpha: 0.3)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline, size: 16, color: AppColors.error),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            errorText!,
                            style: const TextStyle(color: AppColors.error, fontSize: 13),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
            actions: [
              TextButton(
                onPressed: isAdding ? null : () => Navigator.pop(dialogContext),
                child: const Text('Cancel'),
              ),
              FilledButton.icon(
                onPressed: isAdding ? null : () async {
                  final vId = controller.text.trim();
                  if (vId.isEmpty) return;
                  setDialogState(() {
                    isAdding = true;
                    errorText = null;
                  });
                  try {
                    await _api.addDriverVehicle(vId);
                    if (dialogContext.mounted) {
                      Navigator.pop(dialogContext);
                    }
                    if (mounted) {
                      _showMessage('Vehicle added to your list.');
                      _loadVehicles();
                    }
                  } on DioException catch (error) {
                    final response = error.response?.data;
                    final message = response is Map && response['error'] is String
                        ? response['error'] as String
                        : 'Could not add this vehicle.';
                    setDialogState(() {
                      errorText = message;
                      isAdding = false;
                    });
                  } catch (_) {
                    setDialogState(() {
                      errorText = 'Could not add this vehicle. Check your connection and retry.';
                      isAdding = false;
                    });
                  }
                },
                icon: isAdding
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.add),
                label: Text(isAdding ? 'Adding...' : 'Add'),
              ),
            ],
          );
        },
      ),
    );
    controller.dispose();
  }

  Future<void> _openVehicle(String vehicleId) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => DriverVehicleDetailScreen(vehicleId: vehicleId),
      ),
    );
    if (mounted) await _loadVehicles();
  }

  Future<void> _logout() async {
    final auth = context.read<AuthProvider>();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Are you sure you want to logout?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Logout'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await auth.logout();
      if (mounted) Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
    }
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  String _slotLabel(dynamic slotNo) {
    if (slotNo is! num) return 'No service slot';
    return 'SLOT-${slotNo.toInt().toString().padLeft(3, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Vehicles'),
        actions: [
          IconButton(
            onPressed: _loadVehicles,
            tooltip: 'Refresh vehicles',
            icon: const Icon(Icons.refresh_rounded),
          ),
          IconButton(
            onPressed: _logout,
            tooltip: 'Logout',
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadVehicles,
              child: _vehicles.isEmpty
                  ? ListView(
                      padding: const EdgeInsets.all(24),
                      children: [
                        const SizedBox(height: 100),
                        Icon(Icons.directions_bus_outlined,
                            size: 64, color: AppColors.textMuted.withValues(alpha: 0.7)),
                        const SizedBox(height: 16),
                        Text('No vehicles added',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.titleLarge),
                        const SizedBox(height: 8),
                        const Text(
                          'Add the number of a vehicle registered by its operator.',
                          textAlign: TextAlign.center,
                        ),
                      ],
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                      itemCount: _vehicles.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final vehicle = _vehicles[index];
                        final vehicleId = vehicle['vehicle_id'] as String? ?? '';
                        final busy = vehicle['active_driver_id'] != null;
                        return Card(
                          child: ListTile(
                            leading: CircleAvatar(
                              backgroundColor: AppColors.primaryLight,
                              child: const Icon(Icons.directions_bus_rounded,
                                  color: AppColors.primary),
                            ),
                            title: Text(vehicleId,
                                style: const TextStyle(fontWeight: FontWeight.w700)),
                            subtitle: Text([
                              if ((vehicle['vehicle_name'] as String?)?.isNotEmpty == true)
                                vehicle['vehicle_name'] as String,
                              _slotLabel(vehicle['slot_no']),
                              if (vehicle['operator_name'] is String)
                                vehicle['operator_name'] as String,
                            ].join('  ·  ')),
                            trailing: Icon(
                              busy ? Icons.sensors_rounded : Icons.chevron_right_rounded,
                              color: busy ? AppColors.warning : AppColors.textMuted,
                            ),
                            onTap: vehicleId.isEmpty ? null : () => _openVehicle(vehicleId),
                          ),
                        );
                      },
                    ),
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addVehicle,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Add vehicle'),
      ),
    );
  }
}