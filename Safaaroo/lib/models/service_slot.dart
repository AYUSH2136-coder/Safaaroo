/// Represents a service slot created by an operator.
class ServiceSlot {
  final int slotNo;
  final String? slotName;
  final String? vehicleId;
  final String? vehicleName;
  final String? legacySlotLabel;
  final String? driverId;
  final String? driverName;
  final String? driverMobile;
  final String vehicleStatus; // 'active' | 'inactive'
  final List<String> schoolIds;
  final List<String> schoolNames;
  final String? createdAt;

  ServiceSlot({
    required this.slotNo,
    this.slotName,
    this.vehicleId,
    this.vehicleName,
    this.legacySlotLabel,
    this.driverId,
    this.driverName,
    this.driverMobile,
    this.vehicleStatus = 'inactive',
    this.schoolIds = const [],
    this.schoolNames = const [],
    this.createdAt,
  });

  factory ServiceSlot.fromJson(Map<String, dynamic> json) {
    final schools = (json['schools'] as List<dynamic>?) ?? const [];
    return ServiceSlot(
      slotNo: (json['slot_no'] as num).toInt(),
      slotName: json['slot_name'] as String?,
      vehicleId: json['vehicle_id'] as String?,
      vehicleName: json['vehicle_name'] as String?,
      legacySlotLabel: json['legacy_slot_label'] as String?,
      driverId: json['driver_id'] as String?,
      driverName: json['driver_name'] as String?,
      driverMobile: json['driver_mobile'] as String?,
      vehicleStatus: (json['status'] as String?) ?? 'inactive',
      schoolIds: schools.map((s) => (s['school_id'] ?? '').toString()).toList(),
      schoolNames:
          schools.map((s) => (s['school_name'] ?? '').toString()).toList(),
      createdAt: json['created_at'] as String?,
    );
  }

  String get formattedSlotNo => 'SLOT-${slotNo.toString().padLeft(3, '0')}';

  bool get isEmpty => vehicleId == null;

  bool get isActive => !isEmpty && vehicleStatus == 'active';
}
