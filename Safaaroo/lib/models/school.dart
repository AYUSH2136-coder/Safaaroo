/// Represents a school registered by an operator.
class School {
  final String schoolId;
  final String? operatorId;
  final String schoolName;
  final double latitude;
  final double longitude;
  final String? address;
  final String? createdAt;

  School({
    required this.schoolId,
    this.operatorId,
    required this.schoolName,
    required this.latitude,
    required this.longitude,
    this.address,
    this.createdAt,
  });

  factory School.fromJson(Map<String, dynamic> json) {
    return School(
      schoolId: json['school_id'] as String,
      operatorId: json['operator_id'] as String?,
      schoolName: json['school_name'] as String,
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      address: json['address'] as String?,
      createdAt: json['created_at'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'school_id': schoolId,
      'school_name': schoolName,
      'latitude': latitude,
      'longitude': longitude,
      if (address != null) 'address': address,
    };
  }
}
