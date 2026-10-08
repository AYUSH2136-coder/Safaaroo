import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'providers/auth_provider.dart';
import 'screens/login_screen.dart';
import 'screens/operator/operator_dashboard.dart';
import 'screens/driver/driver_vehicle_list_screen.dart';
import 'screens/parent/parent_dashboard.dart';

/// AppRouter handles all named route navigation and acts as an auth guard.
class AppRouter {
  static const String login = '/login';
  static const String operatorDashboard = '/operator';
  static const String driverDashboard = '/driver';
  static const String parentDashboard = '/parent';

  static Route<dynamic> generateRoute(RouteSettings settings) {
    switch (settings.name) {
      case login:
        return MaterialPageRoute(builder: (_) => const LoginScreen());
      case operatorDashboard:
        return _protectedRoute(
          const OperatorDashboard(),
          requiredRole: 'operator',
        );
      case driverDashboard:
        return _protectedRoute(
          const DriverVehicleListScreen(),
          requiredRole: 'driver',
        );
      case parentDashboard:
        return _protectedRoute(
          const ParentDashboard(),
          requiredRole: 'parent',
        );
      default:
        return MaterialPageRoute(
          builder: (_) => Scaffold(
            body: Center(child: Text('No route defined for ${settings.name}')),
          ),
        );
    }
  }

  static Route<dynamic> _protectedRoute(Widget child, {required String requiredRole}) {
    return MaterialPageRoute(
      builder: (context) {
        final auth = context.read<AuthProvider>();

        if (!auth.isAuthenticated) {
          return const LoginScreen();
        }

        if (auth.role != requiredRole) {
          if (auth.role == 'operator') return const OperatorDashboard();
          if (auth.role == 'driver') return const DriverVehicleListScreen();
          if (auth.role == 'parent') return const ParentDashboard();
          return const LoginScreen();
        }

        return child;
      },
    );
  }
}
