import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../services/background_service.dart';
import '../../services/location_service.dart';
import '../../services/socket_service.dart';
import '../../theme/app_theme.dart';
import 'package:permission_handler/permission_handler.dart';

class DriverVehicleDetailScreen extends StatefulWidget {
  const DriverVehicleDetailScreen({super.key, required this.vehicleId});

  final String vehicleId;

  @override
  State<DriverVehicleDetailScreen> createState() => _DriverVehicleDetailScreenState();
}

class _DriverVehicleDetailScreenState extends State<DriverVehicleDetailScreen> {
  final ApiService _api = ApiService();
  final LocationService _location = LocationService();
  final SocketService _socket = SocketService();
  final BackgroundLocationService _backgroundService = BackgroundLocationService();

  Map<String, dynamic>? _vehicle;
  bool _loading = true;
  bool _transmitting = false;
  bool _claimHeld = false;
  bool _busy = false;
  bool _allowPop = false;
  bool _socketConnected = false;
  double? _latitude;
  double? _longitude;
  double? _speed;
  double? _accuracy;
  DateTime? _lastUpdate;
  StreamSubscription? _locationSub;

  @override
  void initState() {
    super.initState();
    _initScreenState();
  }

  @override
  void dispose() {
    _locationSub?.cancel();
    super.dispose();
  }

  Future<void> _initScreenState() async {
    await _loadDetails();
    final isRunning = await _backgroundService.isRunning();
    if (isRunning && _isHeldByCurrentDriver) {
      _listenToBackgroundLocation();
      if (mounted) {
        setState(() {
          _transmitting = true;
          _claimHeld = true;
        });
      }
    }
  }

  Future<void> _loadDetails() async {
    try {
      final response = await _api.getDriverVehicleDetails(widget.vehicleId);
      _vehicle = Map<String, dynamic>.from(response['vehicle'] as Map);
    } catch (_) {
      _showMessage('Could not load vehicle details.');
    }
    if (mounted) setState(() => _loading = false);
  }

  void _listenToBackgroundLocation() {
    _locationSub?.cancel();
    _locationSub = _backgroundService.onLocationUpdate()?.listen((event) {
      if (!mounted) return;
      setState(() {
        _latitude = (event['latitude'] as num?)?.toDouble();
        _longitude = (event['longitude'] as num?)?.toDouble();
        _speed = (event['speed'] as num?)?.toDouble();
        _accuracy = (event['accuracy'] as num?)?.toDouble();
        _socketConnected = event['socketConnected'] == true;
        if (event['timestamp'] is String) {
          _lastUpdate = DateTime.tryParse(event['timestamp'] as String);
        }
      });
    });
  }

  Future<void> _startTransmission() async {
    if (_busy || _transmitting) return;
    setState(() => _busy = true);
    try {
      final hasPermission = await _location.checkAndRequestPermission();
      if (!hasPermission) {
        _showMessage('Location permission denied. Enable GPS to transmit.');
        return;
      }

      if (await Permission.notification.isDenied) {
        await Permission.notification.request();
      }

      await _api.startTransmission(widget.vehicleId);
      _claimHeld = true;

      final started = await _backgroundService.startTracking(widget.vehicleId);
      if (!started) {
        await _stopTransmission(notify: true);
        _showMessage('Failed to start background tracking service.');
        return;
      }

      _listenToBackgroundLocation();
      if (mounted) setState(() => _transmitting = true);
    } on DioException catch (error) {
      final response = error.response?.data;
      final message = response is Map && response['error'] is String
          ? response['error'] as String
          : 'Could not start transmission.';
      _showMessage(message);
    } catch (_) {
      if (_claimHeld) await _stopTransmission(notify: true);
      _showMessage('Could not start transmission. Check GPS and network access.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _stopTransmission({bool notify = true}) async {
    await _locationSub?.cancel();
    _locationSub = null;
    await _backgroundService.stopTracking();

    if (_claimHeld) {
      if (notify) _socket.stopTransmission(widget.vehicleId);
      try {
        await _api.stopTransmission();
      } catch (_) {}
      _claimHeld = false;
    }

    if (mounted) {
      setState(() {
        _transmitting = false;
        _socketConnected = false;
      });
      await _loadDetails();
    }
  }

  Future<void> _confirmBack() async {
    final shouldLeave = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Stop transmission?'),
        content: const Text('Are you sure you want to go back?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('No'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Yes'),
          ),
        ],
      ),
    );
    if (shouldLeave != true || !mounted) return;
    await _stopTransmission();
    if (!mounted) return;
    setState(() => _allowPop = true);
    Navigator.pop(context);
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _removeVehicle() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete vehicle?'),
        content: const Text(
            'Are you sure you want to delete this vehicle? (This will also delete vehicle from your list).'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;

    if (_transmitting || _claimHeld) {
      await _stopTransmission(notify: true);
    }
    if (!mounted) return;
    setState(() => _loading = true);

    try {
      await _api.removeDriverVehicle(widget.vehicleId);
      if (mounted) {
        _showMessage('Vehicle deleted from your list.');
        Navigator.pop(context);
      }
    } on DioException catch (error) {
      final response = error.response?.data;
      final message = response is Map && response['error'] is String
          ? response['error'] as String
          : 'Failed to delete vehicle.';
      _showMessage(message);
      if (mounted) setState(() => _loading = false);
    } catch (_) {
      _showMessage('Failed to delete vehicle. Check connection and retry.');
      if (mounted) setState(() => _loading = false);
    }
  }

  String _slotLabel() {
    final slotNo = _vehicle?['slot_no'];
    if (slotNo is! num) return 'Not assigned to a service slot';
    return 'SLOT-${slotNo.toInt().toString().padLeft(3, '0')}';
  }

  bool get _isHeldByCurrentDriver {
    final driverId = context.read<AuthProvider>().user?.userId;
    return _vehicle?['active_driver_id'] != null &&
        _vehicle?['active_driver_id'] == driverId;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final vehicle = _vehicle;
    if (vehicle == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Vehicle details')),
        body: const Center(child: Text('Vehicle details are unavailable.')),
      );
    }

    final activeDriverId = vehicle['active_driver_id'];
    final busyWithOtherDriver = activeDriverId != null && !_isHeldByCurrentDriver;
    final schools = (vehicle['schools'] as List<dynamic>? ?? const [])
        .map((school) => Map<String, dynamic>.from(school as Map))
        .toList();

    return PopScope(
      canPop: !_transmitting || _allowPop,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _transmitting) unawaited(_confirmBack());
      },
      child: Scaffold(
        appBar: AppBar(title: const Text('Vehicle details')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      const Icon(Icons.directions_bus_rounded,
                          size: 32, color: AppColors.primary),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(widget.vehicleId,
                                style: Theme.of(context).textTheme.titleLarge),
                            if (vehicle['vehicle_name'] is String)
                              Text(vehicle['vehicle_name'] as String),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: _busy ? null : _removeVehicle,
                        icon: const Icon(Icons.delete_outline, color: AppColors.error),
                        tooltip: 'Delete vehicle',
                      ),
                    ]),
                    const Divider(height: 28),
                    _detailRow('Service slot', _slotLabel()),
                    if (vehicle['legacy_slot_label'] is String)
                      _detailRow('Previous slot', vehicle['legacy_slot_label'] as String),
                    _detailRow('Operator', vehicle['operator_name'] as String? ?? 'Not available'),
                    _detailRow('Operator contact', vehicle['operator_mobile'] as String? ?? 'Not available'),
                    _detailRow(
                      'Availability',
                      busyWithOtherDriver
                          ? 'Transmitting with ${vehicle['active_driver_name'] ?? 'another driver'}'
                          : 'Available',
                    ),
                    if (busyWithOtherDriver && vehicle['active_driver_mobile'] is String)
                      _detailRow('Current driver contact', vehicle['active_driver_mobile'] as String),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Schools and institutes', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 10),
                    if (schools.isEmpty)
                      const Text('No schools linked to this service slot.')
                    else
                      ...schools.map((school) => ListTile(
                            contentPadding: EdgeInsets.zero,
                            dense: true,
                            leading: const Icon(Icons.school_outlined),
                            title: Text(school['school_name'] as String? ?? ''),
                          )),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 58,
              child: FilledButton.icon(
                onPressed: _busy || busyWithOtherDriver
                    ? null
                    : (_transmitting ? _stopTransmission : _startTransmission),
                style: FilledButton.styleFrom(
                  backgroundColor: _transmitting ? AppColors.error : AppColors.success,
                  foregroundColor: Colors.white,
                ),
                icon: _busy
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Icon(_transmitting ? Icons.stop_rounded : Icons.play_arrow_rounded),
                label: Text(_transmitting ? 'Stop Transmission' : 'Start Transmission'),
              ),
            ),
            if (_transmitting) ...[
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Row(children: [
                        Icon(Icons.circle, size: 10,
                            color: _socketConnected ? AppColors.success : AppColors.warning),
                        const SizedBox(width: 8),
                        Text(_socketConnected ? 'Live location connected' : 'Connecting to location service'),
                      ]),
                      const Divider(height: 22),
                      _detailRow('Latitude', _latitude?.toStringAsFixed(6) ?? 'Waiting for GPS'),
                      _detailRow('Longitude', _longitude?.toStringAsFixed(6) ?? 'Waiting for GPS'),
                      _detailRow('Speed', _speed == null ? '—' : '${(_speed! * 3.6).toStringAsFixed(1)} km/h'),
                      _detailRow('Accuracy', _accuracy == null ? '—' : '±${_accuracy!.toStringAsFixed(0)} m'),
                      if (_lastUpdate != null)
                        _detailRow('Last update', '${_lastUpdate!.hour.toString().padLeft(2, '0')}:${_lastUpdate!.minute.toString().padLeft(2, '0')}:${_lastUpdate!.second.toString().padLeft(2, '0')}'),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _detailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 132, child: Text(label, style: const TextStyle(color: AppColors.textSecondary))),
          Expanded(child: Text(value, textAlign: TextAlign.end)),
        ],
      ),
    );
  }
}