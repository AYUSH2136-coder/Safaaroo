/// Represents a vehicle (bus) in the fleet.
class Vehicle {
  final String vehicleId;
  final String? operatorId;
  final String? schoolId;
  final String? vehicleName;
  final int? slotNo;
  final String? legacySlotLabel;
  final List<String> schoolIds;
  final List<String> schoolNames;
  final String? driverId;
  final String? driverName;
  final String? driverMobile;
  final String? schoolName;
  final String status; // 'active' | 'inactive'
  final String? createdAt;

  Vehicle({
    required this.vehicleId,
    this.operatorId,
    this.schoolId,
    this.vehicleName,
    this.slotNo,
    this.legacySlotLabel,
    this.schoolIds = const [],
    this.schoolNames = const [],
    this.driverId,
    this.driverName,
    this.driverMobile,
    this.schoolName,
    this.status = 'inactive',
    this.createdAt,
  });

  factory Vehicle.fromJson(Map<String, dynamic> json) {
    return Vehicle(
      vehicleId: json['vehicle_id'] as String,
      operatorId: json['operator_id'] as String?,
      schoolId: json['school_id'] as String?,
      vehicleName: json['vehicle_name'] as String?,
      slotNo: json['slot_no'] is num
          ? (json['slot_no'] as num).toInt()
          : int.tryParse(json['slot_no']?.toString() ?? ''),
      legacySlotLabel: json['legacy_slot_label'] as String?,
      schoolIds: (json['school_ids'] as List<dynamic>? ?? const [])
          .map((value) => value.toString())
          .toList(),
      schoolNames: (json['school_names'] as List<dynamic>? ?? const [])
          .map((value) => value.toString())
          .toList(),
      driverId: json['driver_id'] as String?,
      driverName: json['driver_name'] as String?,
      driverMobile: json['driver_mobile'] as String?,
      schoolName: json['school_name'] as String?,
      status: (json['status'] as String?) ?? 'inactive',
      createdAt: json['created_at'] as String?,
    );
  }

  String? get formattedSlotNo =>
      slotNo == null ? null : 'SLOT-${slotNo.toString().padLeft(3, '0')}';

  Map<String, dynamic> toJson() {
    return {
      'vehicle_id': vehicleId,
      if (schoolId != null) 'school_id': schoolId,
      if (vehicleName != null) 'vehicle_name': vehicleName,
    };
  }
}
