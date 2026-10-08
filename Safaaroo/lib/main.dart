import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'app_router.dart';
import 'config/app_config.dart';
import 'providers/auth_provider.dart';
import 'services/background_service.dart';
import 'services/notification_service.dart';
import 'theme/app_theme.dart';
import 'screens/login_screen.dart';
import 'screens/operator/operator_dashboard.dart';
import 'screens/driver/driver_vehicle_list_screen.dart';
import 'screens/parent/parent_dashboard.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  MapboxOptions.setAccessToken(AppConfig.mapboxAccessToken);

  // Initialize local notifications
  await NotificationService().initialize();

  // Initialize background location service
  await BackgroundLocationService.initialize();

  runApp(
    MultiProvider(
      providers: [ChangeNotifierProvider(create: (_) => AuthProvider())],
      child: const SafaarooApp(),
    ),
  );
}

class SafaarooApp extends StatelessWidget {
  const SafaarooApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      onGenerateRoute: AppRouter.generateRoute,
      home: const SplashWrapper(),
    );
  }
}

class SplashWrapper extends StatefulWidget {
  const SplashWrapper({super.key});

  @override
  State<SplashWrapper> createState() => _SplashWrapperState();
}

class _SplashWrapperState extends State<SplashWrapper> {
  late Future<void> _initFuture;

  @override
  void initState() {
    super.initState();
    _initFuture = context.read<AuthProvider>().checkSavedAuth();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder(
      future: _initFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        final auth = context.watch<AuthProvider>();
        if (auth.isAuthenticated) {
          if (auth.role == 'operator') {
            return const OperatorDashboard();
          } else if (auth.role == 'driver') {
            return const DriverVehicleListScreen();
          } else if (auth.role == 'parent') {
            return const ParentDashboard();
          }
        }

        return const LoginScreen();
      },
    );
  }
}
