/// Represents a driver's profile including their assigned vehicle info.
/// Matches the backend JOIN query in `driverController.getProfile`.
class DriverProfile {
  final String? profileId;
  final String userId;
  final String name;
  final String mobile;
  final String role;
  final String? vehicleId;
  final String? vehicleName;
  final int? slotNo;
  final String? vehicleStatus;
  final String? schoolName;
  final double? schoolLat;
  final double? schoolLng;
  final int isUnderOperator;

  DriverProfile({
    this.profileId,
    required this.userId,
    required this.name,
    required this.mobile,
    required this.role,
    this.vehicleId,
    this.vehicleName,
    this.slotNo,
    this.vehicleStatus,
    this.schoolName,
    this.schoolLat,
    this.schoolLng,
    this.isUnderOperator = 1,
  });

  factory DriverProfile.fromJson(Map<String, dynamic> json) {
    return DriverProfile(
      profileId: json['profile_id'] as String?,
      userId: json['user_id'] as String,
      name: json['name'] as String,
      mobile: json['mobile'] as String,
      role: (json['role'] as String?) ?? 'driver',
      vehicleId: json['vehicle_id'] as String?,
      vehicleName: json['vehicle_name'] as String?,
      slotNo: json['slot_no'] is num
          ? (json['slot_no'] as num).toInt()
          : int.tryParse(json['slot_no']?.toString() ?? ''),
      vehicleStatus: json['vehicle_status'] as String?,
      schoolName: json['school_name'] as String?,
      schoolLat: json['school_lat'] != null
          ? (json['school_lat'] as num).toDouble()
          : null,
      schoolLng: json['school_lng'] != null
          ? (json['school_lng'] as num).toDouble()
          : null,
      isUnderOperator: (json['is_under_operator'] as int?) ?? 1,
    );
  }
}
