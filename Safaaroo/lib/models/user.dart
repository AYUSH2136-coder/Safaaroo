/// Represents a SafaaRoo user (any role: operator, driver, parent).
class User {
  final String userId;
  final String name;
  final String mobile;
  final String role;
  final String? createdAt;

  User({
    required this.userId,
    required this.name,
    required this.mobile,
    required this.role,
    this.createdAt,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      userId: json['user_id'] as String,
      name: json['name'] as String,
      mobile: json['mobile'] as String,
      role: json['role'] as String,
      createdAt: json['created_at'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'user_id': userId,
      'name': name,
      'mobile': mobile,
      'role': role,
      if (createdAt != null) 'created_at': createdAt,
    };
  }
}
