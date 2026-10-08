import 'dart:async';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/parent_route.dart';
import '../../services/api_service.dart';
import '../../services/socket_service.dart';
import '../../theme/app_theme.dart';

class RouteLiveTrackerScreen extends StatefulWidget {
  final String routeId;

  const RouteLiveTrackerScreen({super.key, required this.routeId});

  @override
  State<RouteLiveTrackerScreen> createState() => _RouteLiveTrackerScreenState();
}

class _RouteLiveTrackerScreenState extends State<RouteLiveTrackerScreen> {
  final ApiService _api = ApiService();
  final SocketService _socket = SocketService();

  bool _loading = true;
  ParentRoute? _route;
  String? _error;

  // Live state
  bool _connected = false;
  double? _busLat;
  double? _busLng;
  double? _busSpeed;
  DateTime? _lastUpdate;

  // Bus status (derived from speed + data)
  String _busStatus = 'Offline';
  Color _busStatusColor = AppColors.textMuted;
  Timer? _offlineTimer;

  @override
  void initState() {
    super.initState();
    _loadRouteAndConnect();
  }

  @override
  void dispose() {
    _offlineTimer?.cancel();
    _cleanupSocket();
    super.dispose();
  }

  Future<void> _loadRouteAndConnect() async {
    _cleanupSocket();
    setState(() => _loading = true);
    try {
      final data = await _api.getRouteDetail(widget.routeId);
      _route = ParentRoute.fromJson(data['route']);

      if (_route?.slotNo != null || _route?.vehicleId != null) {
        _setupSocket();
      }
    } catch (e) {
      _error = 'Failed to load route details';
    }
    if (mounted) setState(() => _loading = false);
  }

  void _setupSocket() {
    final slotNo = _route!.slotNo;
    final vehicleId = _route!.vehicleId;

    final ioSocket = _socket.getSocket();
    void subscribe() {
      if (slotNo != null) {
        _socket.joinSlotRoom(slotNo);
      } else if (vehicleId != null) {
        _socket.joinVehicleRoom(vehicleId);
      }
    }

    _socket.onConnect(() {
      subscribe();
      if (mounted) setState(() => _connected = true);
    });

    _socket.onDisconnect(() {
      if (mounted) setState(() => _connected = false);
    });

    _socket.onVehicleLocationUpdated((data) {
      if (!mounted) return;
      final inboundSlotNo = data['slot_no'] != null ? int.tryParse(data['slot_no'].toString()) : null;
      final matchesSlot = slotNo != null && inboundSlotNo == slotNo;
      final matchesLegacyVehicle =
          slotNo == null &&
          vehicleId != null &&
          (data['vehicle_id'] == vehicleId || data['device_id'] == vehicleId);
      if (matchesSlot || matchesLegacyVehicle) {
        setState(() {
          _busLat = (data['latitude'] as num).toDouble();
          _busLng = (data['longitude'] as num).toDouble();
          _busSpeed = data['speed'] != null
              ? (data['speed'] as num).toDouble()
              : null;
          _lastUpdate = DateTime.now();
          _updateBusStatus();
        });
        // Reset offline timer
        _offlineTimer?.cancel();
        _offlineTimer = Timer(const Duration(seconds: 30), () {
          if (mounted) {
            setState(() {
              _busStatus = 'Offline';
              _busStatusColor = AppColors.textMuted;
            });
          }
        });
      }
    });

    if (ioSocket.connected) {
      subscribe();
      _connected = true;
    }
  }

  void _updateBusStatus() {
    if (_busSpeed == null || _busLat == null) {
      _busStatus = 'Offline';
      _busStatusColor = AppColors.textMuted;
      return;
    }

    final speedKmh = _busSpeed! * 3.6;
    if (speedKmh > 5) {
      _busStatus = 'Running';
      _busStatusColor = AppColors.success;
    } else {
      _busStatus = 'At Stop';
      _busStatusColor = AppColors.warning;
    }
  }

  void _cleanupSocket() {
    if (_route?.slotNo != null) {
      _socket.leaveSlotRoom(_route!.slotNo!);
    } else if (_route?.vehicleId != null) {
      _socket.leaveVehicleRoom(_route!.vehicleId!);
    }
    if (_route?.slotNo != null || _route?.vehicleId != null) {
      _socket.off('vehicle_location_updated');
      _socket.off('connect');
      _socket.off('disconnect');
    }
  }

  Future<void> _openInMaps(double lat, double lng, String label) async {
    final url = Uri.parse('https://www.google.com/maps/search/?api=1&query=$lat,$lng');
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _callNumber(String number) async {
    final url = Uri.parse('tel:$number');
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
    }
  }

  Future<void> _deleteRoute() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Route'),
        content: const Text(
            'Are you sure you want to delete this route? (This will also delete it from your list.)'),
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

    if (confirm != true) return;

    try {
      await _api.deleteRoute(widget.routeId);
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Route deleted successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to delete route')),
        );
      }
    }
  }

  /// Whether the bus is currently transmitting (based on route data OR live data)
  bool get _isBusOnline =>
      _route?.isActive == true || _busLat != null;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_route?.routeName ?? 'Live Tracker'),
        actions: [
          // Online/Offline dot badge (transmission based, NOT socket connection)
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: _isBusOnline
                      ? AppColors.successLight
                      : AppColors.surfaceVariant,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: _isBusOnline
                            ? AppColors.success
                            : AppColors.textMuted,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      _isBusOnline ? 'Online' : 'Offline',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: _isBusOnline
                            ? AppColors.successDark
                            : AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Text(_error!,
                      style: const TextStyle(color: AppColors.error)))
              : RefreshIndicator(
                  onRefresh: _loadRouteAndConnect,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _buildInfoCards(),
                      const SizedBox(height: 16),
                      _buildLiveTrackingTimeline(),
                      const SizedBox(height: 32),
                      OutlinedButton.icon(
                        onPressed: _deleteRoute,
                        icon: const Icon(Icons.delete_outline),
                        label: const Text('Delete Route'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.error,
                          side: const BorderSide(
                              color: AppColors.error, width: 1.5),
                        ),
                      ),
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
    );
  }

  Widget _buildInfoCards() {
    return Column(
      children: [
        // Basic Info Card
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'BASIC DETAILS',
                  style: Theme.of(context)
                      .textTheme
                      .labelSmall
                      ?.copyWith(letterSpacing: 1.2),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    _buildDetailItem(
                        'Bus No', _route?.vehicleId ?? 'Unassigned'),
                    _buildDetailItem(
                        'Slot No',
                        _route?.slotNo != null
                            ? 'SLOT-${_route!.slotNo.toString().padLeft(3, '0')}'
                            : 'Unassigned',
                        alignRight: true),
                  ],
                ),
                const Divider(height: 24),
                // Driver row
                _buildContactRow(
                    'Driver',
                    _route?.driverName ?? 'Unknown',
                    _route?.driverMobile),
                const SizedBox(height: 12),
                // Operator row — now shows phone number too
                _buildContactRow(
                    'Operator',
                    _route?.operatorName ?? 'Unknown',
                    _route?.operatorMobile),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        // Variable Details Card
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'LIVE DETAILS',
                  style: Theme.of(context)
                      .textTheme
                      .labelSmall
                      ?.copyWith(letterSpacing: 1.2),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                        child: _buildDetailItem(
                            'Latitude', _busLat?.toStringAsFixed(6) ?? '--')),
                    Expanded(
                        child: _buildDetailItem(
                            'Longitude', _busLng?.toStringAsFixed(6) ?? '--',
                            alignRight: true)),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _buildDetailItem(
                          'Speed',
                          _busSpeed != null
                              ? '${(_busSpeed! * 3.6).toStringAsFixed(1)} km/h'
                              : '--'),
                    ),
                    Expanded(
                      child: _buildDetailItem(
                          'Last Update',
                          _lastUpdate != null
                              ? '${_lastUpdate!.hour.toString().padLeft(2, '0')}:${_lastUpdate!.minute.toString().padLeft(2, '0')}:${_lastUpdate!.second.toString().padLeft(2, '0')}'
                              : '--',
                          alignRight: true),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildDetailItem(String label, String value,
      {bool alignRight = false}) {
    return Column(
      crossAxisAlignment:
          alignRight ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style:
              const TextStyle(fontSize: 12, color: AppColors.textSecondary),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary),
        ),
      ],
    );
  }

  /// Contact row that shows: role label, name, phone number, call icon
  Widget _buildContactRow(String role, String name, String? mobile) {
    return Row(
      children: [
        // Role label
        SizedBox(
          width: 60,
          child: Text(
            role,
            style:
                const TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
        ),
        const SizedBox(width: 8),
        // Name
        Expanded(
          child: Text(
            name,
            style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (mobile != null) ...[
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => _callNumber(mobile),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  mobile,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.primary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(width: 4),
                const Icon(Icons.phone, size: 16, color: AppColors.success),
              ],
            ),
          ),
        ],
      ],
    );
  }

  /// ──────────────── JOURNEY TRACKER (Redesigned) ────────────────

  // Swap state: false = Pickup mode (Start → Pickup → School)
  //             true  = Drop mode  (School → Pickup)
  bool _isDropMode = false;

  Widget _buildLiveTrackingTimeline() {
    // Define route points based on current mode
    final List<_JourneyStop> stops = _isDropMode
        ? [
            _JourneyStop(
              label: _route?.displaySchoolName ?? 'School',
              icon: Icons.school,
              color: AppColors.error,
              lat: _route?.effectiveSchoolLat,
              lng: _route?.effectiveSchoolLng,
            ),
            if (_busLat != null && _busStatus != 'Offline')
              _JourneyStop(
                label: 'Live Bus Position',
                icon: Icons.directions_bus_rounded,
                color: AppColors.primary,
                lat: null,
                lng: null,
                sublabel: '$_busStatus • ${_busSpeed != null ? (_busSpeed! * 3.6).toStringAsFixed(1) : "0.0"} km/h',
              ),
            _JourneyStop(
              label: _route?.displayPickupName ?? 'Pickup Point',
              icon: Icons.location_on,
              color: AppColors.success,
              lat: _route?.homeLat,
              lng: _route?.homeLng,
              sublabel: 'Drop Location',
            ),
          ]
        : [
            _JourneyStop(
              label: 'Start',
              icon: null,
              color: AppColors.textMuted,
              lat: null,
              lng: null,
              sublabel: 'Route Origin',
            ),
            if (_busLat != null && _busStatus != 'Offline')
              _JourneyStop(
                label: 'Live Bus Position',
                icon: Icons.directions_bus_rounded,
                color: AppColors.primary,
                lat: null,
                lng: null,
                sublabel: '$_busStatus • ${_busSpeed != null ? (_busSpeed! * 3.6).toStringAsFixed(1) : "0.0"} km/h',
              ),
            _JourneyStop(
              label: _route?.displayPickupName ?? 'Pickup Point',
              icon: Icons.location_on,
              color: AppColors.success,
              lat: _route?.homeLat,
              lng: _route?.homeLng,
            ),
            _JourneyStop(
              label: _route?.displaySchoolName ?? 'School',
              icon: Icons.school,
              color: AppColors.error,
              lat: _route?.effectiveSchoolLat,
              lng: _route?.effectiveSchoolLng,
            ),
          ];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header with swap button ──
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'JOURNEY TRACKER',
                        style: Theme.of(context)
                            .textTheme
                            .labelSmall
                            ?.copyWith(letterSpacing: 1.2),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _isDropMode ? 'Drop Mode' : 'Pickup Mode',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: _isDropMode
                              ? AppColors.warning
                              : AppColors.primary,
                        ),
                      ),
                    ],
                  ),
                ),
                // Swap button
                Material(
                  color: AppColors.surfaceVariant,
                  borderRadius: BorderRadius.circular(10),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: () => setState(() => _isDropMode = !_isDropMode),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 8),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.swap_vert_rounded,
                            size: 18,
                            color: AppColors.primary,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            _isDropMode ? 'Pickup' : 'Drop',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppColors.primary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 24),

            // ── Route stops timeline ──
            ...List.generate(stops.length * 2 - 1, (index) {
              if (index.isEven) {
                final stop = stops[index ~/ 2];
                return _buildJourneyStopNode(stop);
              } else {
                return _buildJourneyLine();
              }
            }),
          ],
        ),
      ),
    );
  }

  /// A single stop node in the journey timeline
  Widget _buildJourneyStopNode(_JourneyStop stop) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Circle indicator
        Container(
          margin: const EdgeInsets.only(top: 2),
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: stop.color.withValues(alpha: 0.12),
            shape: BoxShape.circle,
            border: Border.all(color: stop.color, width: 2.5),
          ),
          child: stop.icon != null
              ? Icon(stop.icon, size: 13, color: stop.color)
              : null,
        ),
        const SizedBox(width: 14),
        // Content
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                stop.label,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                  color: AppColors.textPrimary,
                ),
              ),
              if (stop.sublabel != null) ...[
                const SizedBox(height: 2),
                Text(
                  stop.sublabel!,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
              if (stop.lat != null && stop.lng != null) ...[
                const SizedBox(height: 2),
                Text(
                  'Location set',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
              ] else ...[
                const SizedBox(height: 2),
                Text(
                  stop.sublabel ?? 'Location not set',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textMuted,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  /// Connecting line between journey stops — taller for readability
  Widget _buildJourneyLine() {
    return Container(
      margin: const EdgeInsets.only(left: 13, top: 4, bottom: 4),
      width: 2,
      height: 64,
      decoration: BoxDecoration(
        color: AppColors.textMuted.withValues(alpha: 0.6),
      ),
    );
  }

}

/// Data class for a journey stop (NOT the bus — the bus is independent)
class _JourneyStop {
  final String label;
  final IconData? icon;
  final Color color;
  final double? lat;
  final double? lng;
  final String? sublabel;

  const _JourneyStop({
    required this.label,
    required this.icon,
    required this.color,
    this.lat,
    this.lng,
    this.sublabel,
  });
}
