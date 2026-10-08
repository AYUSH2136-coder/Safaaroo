/// Represents a tracking route created by a parent.
/// Matches the backend response from `parentController.getRoutes` and `getRouteDetail`.
class ParentRoute {
  final String routeId;
  final String routeName;
  final String? schoolId;
  final int? slotNo;
  final double? homeLat;
  final double? homeLng;
  final String? notifyPref; // 'sms' | 'whatsapp' | 'both' | 'none'
  final DateTime? createdAt;

  // Personal school fields (saved in route only, not global)
  final String? customSchoolName;
  final double? customSchoolLat;
  final double? customSchoolLng;

  // Personal pickup location name
  final String? pickupName;

  // JOINed fields from backend
  final String? schoolName;
  final double? schoolLat;
  final double? schoolLng;
  final String? vehicleId;
  final String? vehicleName;
  final String? driverName;
  final String? driverMobile;
  final String? operatorName;
  final String? operatorMobile;
  final String? transmissionStatus; // e.g., 'transmitting', 'stopped'

  ParentRoute({
    required this.routeId,
    required this.routeName,
    this.schoolId,
    this.slotNo,
    this.homeLat,
    this.homeLng,
    this.notifyPref,
    this.createdAt,
    this.customSchoolName,
    this.customSchoolLat,
    this.customSchoolLng,
    this.pickupName,
    this.schoolName,
    this.schoolLat,
    this.schoolLng,
    this.vehicleId,
    this.vehicleName,
    this.driverName,
    this.driverMobile,
    this.operatorName,
    this.operatorMobile,
    this.transmissionStatus,
  });

  factory ParentRoute.fromJson(Map<String, dynamic> json) {
    return ParentRoute(
      routeId: json['route_id'] as String,
      routeName: json['route_name'] as String,
      schoolId: json['school_id'] as String?,
      slotNo: json['slot_no'] is num
          ? (json['slot_no'] as num).toInt()
          : int.tryParse(json['slot_no']?.toString() ?? ''),
      homeLat: json['home_lat'] != null
          ? (json['home_lat'] as num).toDouble()
          : null,
      homeLng: json['home_lng'] != null
          ? (json['home_lng'] as num).toDouble()
          : null,
      notifyPref: json['notify_pref'] as String?,
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'])?.toLocal()
          : null,
      customSchoolName: json['custom_school_name'] as String?,
      customSchoolLat: json['custom_school_lat'] != null
          ? (json['custom_school_lat'] as num).toDouble()
          : null,
      customSchoolLng: json['custom_school_lng'] != null
          ? (json['custom_school_lng'] as num).toDouble()
          : null,
      pickupName: json['pickup_name'] as String?,
      schoolName: json['school_name'] as String?,
      schoolLat: json['school_lat'] != null
          ? (json['school_lat'] as num).toDouble()
          : null,
      schoolLng: json['school_lng'] != null
          ? (json['school_lng'] as num).toDouble()
          : null,
      vehicleId: json['vehicle_id'] as String?,
      vehicleName: json['vehicle_name'] as String?,
      driverName: json['driver_name'] as String?,
      driverMobile: json['driver_mobile'] as String?,
      operatorName: json['operator_name'] as String?,
      operatorMobile: json['operator_mobile'] as String?,
      transmissionStatus: json['transmission_status'] as String?,
    );
  }

  /// Helper to check if the assigned bus is currently transmitting
  bool get isActive => transmissionStatus == 'online' || transmissionStatus == 'transmitting';

  /// Display name for the school — prefers custom name over DB name
  String get displaySchoolName => customSchoolName ?? schoolName ?? 'Not set';

  /// Display name for the pickup location
  String get displayPickupName => pickupName ?? 'Pickup Location';

  /// Effective school lat (custom overrides DB)
  double? get effectiveSchoolLat => customSchoolLat ?? schoolLat;

  /// Effective school lng (custom overrides DB)
  double? get effectiveSchoolLng => customSchoolLng ?? schoolLng;
}
