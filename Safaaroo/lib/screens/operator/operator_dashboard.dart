import 'package:flutter/material.dart';
import '../../models/school.dart';
import '../../models/vehicle.dart';
import '../../models/service_slot.dart';
import '../../services/api_service.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../theme/app_theme.dart';
import 'add_school_modal.dart';
import 'add_vehicle_modal.dart';
import 'create_slot_modal.dart';

/// Operator Dashboard — three tabs: Schools, Vehicles, Slots.
class OperatorDashboard extends StatefulWidget {
  const OperatorDashboard({super.key});

  @override
  State<OperatorDashboard> createState() => _OperatorDashboardState();
}

class _OperatorDashboardState extends State<OperatorDashboard>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ApiService _api = ApiService();

  List<School> _schools = [];
  List<Vehicle> _vehicles = [];
  List<ServiceSlot> _slots = [];
  bool _loadingSchools = true;
  bool _loadingVehicles = true;
  bool _loadingSlots = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(() => setState(() {}));
    _loadSchools();
    _loadVehicles();
    _loadSlots();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadSchools() async {
    setState(() => _loadingSchools = true);
    try {
      final data = await _api.getOperatorSchools();
      _schools = (data['schools'] as List)
          .map((s) => School.fromJson(s))
          .toList();
    } catch (e) {
      _error = 'Failed to load schools';
    }
    if (mounted) setState(() => _loadingSchools = false);
  }

  Future<void> _loadVehicles() async {
    setState(() => _loadingVehicles = true);
    try {
      final data = await _api.getOperatorVehicles();
      final list = data['vehicles'] as List? ?? [];
      debugPrint('[OperatorDashboard] Loaded ${list.length} vehicles');
      _vehicles = list.map((v) => Vehicle.fromJson(v as Map<String, dynamic>)).toList();
      _error = null;
    } catch (e, st) {
      debugPrint('[OperatorDashboard] _loadVehicles error: $e\n$st');
      _error = 'Failed to load vehicles';
    }
    if (mounted) setState(() => _loadingVehicles = false);
  }

  Future<void> _loadSlots() async {
    setState(() => _loadingSlots = true);
    try {
      final data = await _api.getOperatorSlots();
      _slots = (data['slots'] as List)
          .map((s) => ServiceSlot.fromJson(s))
          .toList();
    } catch (e) {
      _error = 'Failed to load slots';
    }
    if (mounted) setState(() => _loadingSlots = false);
  }

  void _showAddSchool() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => AddSchoolModal(
        onSchoolAdded: () {
          _loadSchools();
        },
        existingSchools: _schools,
      ),
    );
  }

  void _showAddVehicle() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => AddVehicleModal(
        onVehicleAdded: () {
          _loadVehicles();
        },
      ),
    );
  }

  void _showCreateSlot() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => CreateSlotModal(
        onUpdated: () {
          _loadSlots();
          _loadVehicles();
        },
        schools: _schools,
        vehicles: _vehicles,
      ),
    );
  }

  void _showManageSlot(ServiceSlot slot) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => CreateSlotModal(
        existingSlot: slot,
        onUpdated: () {
          _loadSlots();
          _loadVehicles();
        },
        schools: _schools,
        vehicles: _vehicles,
      ),
    );
  }

  // ── School Details & Delete ──────────────────────────────────────────────

  void _showSchoolDetails(School school) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                school.schoolName,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              _buildInfoRow(
                Icons.location_on_outlined,
                school.address ?? 'No address provided',
              ),
              const SizedBox(height: 10),
              _buildInfoRow(
                Icons.map_outlined,
                '${school.latitude.toStringAsFixed(6)}, ${school.longitude.toStringAsFixed(6)}',
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {
                        Navigator.pop(sheetContext);
                        showModalBottomSheet(
                          context: context,
                          isScrollControlled: true,
                          builder: (_) => AddSchoolModal(
                            initialSchool: school,
                            onSchoolAdded: _loadSchools,
                            existingSchools: _schools,
                          ),
                        );
                      },
                      icon: const Icon(Icons.edit_outlined),
                      label: const Text('Update Details'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {
                        Navigator.pop(sheetContext);
                        _deleteSchool(school);
                      },
                      icon: const Icon(Icons.delete_outline,
                          color: AppColors.error),
                      label: const Text(
                        'Delete',
                        style: TextStyle(color: AppColors.error),
                      ),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: AppColors.error),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _deleteSchool(School school) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete School'),
        content: const Text(
            'Are you sure you want to delete this school? (This will also delete school from your list).'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        await _api.deleteSchool(school.schoolId);
        _loadSchools();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('School deleted from your list')));
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Failed to delete school')),
          );
        }
      }
    }
  }

  // ── Vehicle Delete ──────────────────────────────────────────────────────

  Future<void> _deleteVehicle(Vehicle vehicle) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Vehicle'),
        content: const Text(
            'Are you sure you want to delete this vehicle? (This will also delete it from your profile).'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        await _api.deleteVehicle(vehicle.vehicleId);
        _loadVehicles();
        _loadSlots();
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('Vehicle deleted')));
        }
      } catch (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Vehicle cannot be deleted while assigned to a slot.')),
          );
        }
      }
    }
  }

  // ── Slot Delete ─────────────────────────────────────────────────────────

  Future<void> _deleteSlot(ServiceSlot slot) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Slot'),
        content: Text(slot.isEmpty
            ? 'Are you sure you want to delete ${slot.formattedSlotNo}?'
            : 'Are you sure you want to delete ${slot.formattedSlotNo}? The assigned vehicle will be unassigned but not deleted.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        await _api.deleteSlot(slot.slotNo);
        _loadSlots();
        _loadVehicles();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Slot deleted')));
        }
      } catch (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Failed to delete slot')),
          );
        }
      }
    }
  }

  // ── Build ───────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Operator Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout_rounded),
            tooltip: 'Logout',
            onPressed: () async {
              final authProvider = context.read<AuthProvider>();
              final navigator = Navigator.of(context);
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
                      style: FilledButton.styleFrom(
                          backgroundColor: AppColors.error),
                      child: const Text('Logout'),
                    ),
                  ],
                ),
              );
              if (confirmed == true) {
                await authProvider.logout();
                if (mounted) {
                  navigator.pushReplacementNamed('/login');
                }
              }
            },
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(icon: Icon(Icons.school_outlined), text: 'Schools'),
            Tab(
                icon: Icon(Icons.directions_bus_outlined), text: 'Vehicles'),
            Tab(icon: Icon(Icons.grid_view_rounded), text: 'Slots'),
          ],
        ),
      ),
      body: Column(
        children: [
          if (_error != null)
            MaterialBanner(
              content: Text(_error!),
              actions: [
                TextButton(
                  onPressed: () => setState(() => _error = null),
                  child: const Text('Dismiss'),
                ),
              ],
            ),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildSchoolsTab(),
                _buildVehiclesTab(),
                _buildSlotsTab(),
              ],
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          if (_tabController.index == 0) {
            _showAddSchool();
          } else if (_tabController.index == 1) {
            _showAddVehicle();
          } else {
            _showCreateSlot();
          }
        },
        child: const Icon(Icons.add),
      ),
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Schools Tab
  // ══════════════════════════════════════════════════════════════════════════

  Widget _buildSchoolsTab() {
    if (_loadingSchools) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_schools.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.school_outlined, size: 56, color: AppColors.textMuted),
            const SizedBox(height: 12),
            Text(
              'No schools added yet',
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(color: AppColors.textMuted),
            ),
            const SizedBox(height: 4),
            Text(
              'Tap + to register your first school',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadSchools,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _schools.length,
        itemBuilder: (context, index) {
          final school = _schools[index];
          return Card(
            clipBehavior: Clip.antiAlias,
            child: ListTile(
              onTap: () => _showSchoolDetails(school),
              leading: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.primaryLight,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.school_rounded,
                  color: AppColors.primary,
                  size: 22,
                ),
              ),
              title: Text(
                school.schoolName,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: Text(
                school.address ??
                    '${school.latitude.toStringAsFixed(4)}, ${school.longitude.toStringAsFixed(4)}',
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.textMuted,
                ),
              ),
              trailing: const Icon(
                Icons.chevron_right,
                color: AppColors.textMuted,
              ),
            ),
          );
        },
      ),
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Vehicles Tab — simplified: vehicle number, status, slot no, delete button
  // ══════════════════════════════════════════════════════════════════════════

  Widget _buildVehiclesTab() {
    if (_loadingVehicles) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _vehicles.isEmpty) {
      return Center(
        child: Text(_error!, style: const TextStyle(color: AppColors.error)),
      );
    }

    if (_vehicles.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.directions_bus_outlined,
              size: 56,
              color: AppColors.textMuted,
            ),
            const SizedBox(height: 12),
            Text(
              'No vehicles registered',
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(color: AppColors.textMuted),
            ),
            const SizedBox(height: 4),
            Text(
              'Tap + to add your first vehicle',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadVehicles,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _vehicles.length,
        itemBuilder: (context, index) {
          final vehicle = _vehicles[index];
          return Card(
            clipBehavior: Clip.antiAlias,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: vehicle.status == 'active'
                            ? AppColors.successLight
                            : AppColors.surfaceVariant,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        Icons.directions_bus_rounded,
                        color: vehicle.status == 'active'
                            ? AppColors.success
                            : AppColors.textMuted,
                        size: 22,
                      ),
                    ),
                    title: Row(
                      children: [
                        Expanded(
                          child: Text(
                            vehicle.vehicleId,
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: vehicle.status == 'active'
                                ? AppColors.successLight
                                : AppColors.surfaceVariant,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            vehicle.status == 'active' ? 'Active' : 'Inactive',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: vehicle.status == 'active' ? AppColors.success : AppColors.textMuted,
                            ),
                          ),
                        ),
                      ],
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 8.0),
                      child: Row(
                        children: [
                          if (vehicle.slotNo != null)
                            Expanded(child: _buildInfoRow(Icons.tag, vehicle.formattedSlotNo!))
                          else
                            const Spacer(),
                          InkWell(
                            onTap: () => _deleteVehicle(vehicle),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.delete_outline, size: 16, color: AppColors.error),
                                const SizedBox(width: 4),
                                const Text('Delete', style: TextStyle(color: AppColors.error, fontSize: 13)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Slots Tab — slot name, slot no, vehicle section (if assigned), manage/delete
  // ══════════════════════════════════════════════════════════════════════════

  Widget _buildSlotsTab() {
    if (_loadingSlots) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_slots.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.grid_view_rounded, size: 56, color: AppColors.textMuted),
            const SizedBox(height: 12),
            Text(
              'No service slots created',
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(color: AppColors.textMuted),
            ),
            const SizedBox(height: 4),
            Text(
              'Tap + to create your first slot',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadSlots,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _slots.length,
        itemBuilder: (context, index) {
          final slot = _slots[index];
          return Card(
            clipBehavior: Clip.antiAlias,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Top: Slot Name | Active/Inactive marker (only if vehicle assigned)
                  Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: slot.isActive
                              ? AppColors.successLight
                              : AppColors.surfaceVariant,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          Icons.grid_view_rounded,
                          color: slot.isActive
                              ? AppColors.success
                              : AppColors.textMuted,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              slot.slotName ?? slot.formattedSlotNo,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 15,
                              ),
                            ),
                            Text(
                              slot.formattedSlotNo,
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Active/Inactive marker — only shown if vehicle is assigned
                      if (!slot.isEmpty)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: slot.isActive
                                ? AppColors.successLight
                                : AppColors.surfaceVariant,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            slot.isActive ? 'Active' : 'Inactive',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: slot.isActive
                                  ? AppColors.success
                                  : AppColors.textMuted,
                            ),
                          ),
                        ),
                    ],
                  ),

                  // Vehicle section — only shown if a vehicle is assigned
                  if (!slot.isEmpty) ...[
                    const Divider(height: 20),
                    Row(
                      children: [
                        Expanded(
                          child: _buildInfoRow(
                            Icons.directions_bus_outlined,
                            slot.vehicleId ?? '',
                          ),
                        ),
                        Expanded(
                          child: _buildInfoRow(
                            Icons.person_outline,
                            slot.driverName ?? 'No driver',
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Expanded(
                          child: _buildInfoRow(
                            Icons.school_outlined,
                            slot.schoolNames.isNotEmpty
                                ? slot.schoolNames.join(', ')
                                : 'No school',
                          ),
                        ),
                        Expanded(
                          child: _buildInfoRow(
                            Icons.phone_outlined,
                            slot.driverMobile ?? '-',
                          ),
                        ),
                      ],
                    ),
                  ],

                  const SizedBox(height: 10),
                  // Bottom: Delete (left) | Manage Slot (right)
                  Row(
                    children: [
                      TextButton.icon(
                        onPressed: () => _deleteSlot(slot),
                        icon: const Icon(Icons.delete_outline,
                            size: 16, color: AppColors.error),
                        label: const Text(
                          'Delete',
                          style:
                              TextStyle(color: AppColors.error, fontSize: 13),
                        ),
                      ),
                      const Spacer(),
                      TextButton.icon(
                        onPressed: () => _showManageSlot(slot),
                        icon: const Icon(Icons.swap_horiz,
                            size: 16, color: AppColors.primary),
                        label: Text(
                          'Manage Slot',
                          style: TextStyle(
                              color: AppColors.primary, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // ── Shared helpers ──────────────────────────────────────────────────────

  Widget _buildInfoRow(IconData icon, String text) {
    return Row(
      children: [
        Icon(icon, size: 14, color: AppColors.textMuted),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.textSecondary,
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}
