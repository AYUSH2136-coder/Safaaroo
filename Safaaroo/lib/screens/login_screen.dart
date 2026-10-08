import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../theme/app_theme.dart';

/// Login & Registration screen — mirrors `Login.jsx` from the web app.
/// Supports role selection (Operator / Driver / Parent) with smooth toggle.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with SingleTickerProviderStateMixin {
  bool _isLogin = true;
  bool _obscurePassword = true;

  // Shared fields
  final _mobileController = TextEditingController();
  final _passwordController = TextEditingController();

  // Register-only fields
  final _nameController = TextEditingController();
  final _studentNameController = TextEditingController();
  String _selectedRole = 'parent';

  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _mobileController.dispose();
    _passwordController.dispose();
    _nameController.dispose();
    _studentNameController.dispose();
    super.dispose();
  }

  void _toggleMode() {
    setState(() {
      _isLogin = !_isLogin;
      context.read<AuthProvider>().clearError();
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final authProvider = context.read<AuthProvider>();

    bool success;
    if (_isLogin) {
      success = await authProvider.login(
        _mobileController.text.trim(),
        _passwordController.text,
      );
    } else {
      final payload = <String, dynamic>{
        'name': _nameController.text.trim(),
        'mobile': _mobileController.text.trim(),
        'password': _passwordController.text,
        'role': _selectedRole,
      };
      if (_selectedRole == 'parent') {
        payload['student_name'] = _studentNameController.text.trim();
      }
      success = await authProvider.register(payload);
    }

    if (success && mounted) {
      final role = authProvider.role;
      if (role == 'operator') {
        Navigator.pushReplacementNamed(context, '/operator');
      } else if (role == 'driver') {
        Navigator.pushReplacementNamed(context, '/driver');
      } else if (role == 'parent') {
        Navigator.pushReplacementNamed(context, '/parent');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: Column(
              children: [
                // ── Logo & Title ──────────────────────────────────────────
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: AppColors.primaryLight,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Icon(
                    Icons.directions_bus_rounded,
                    size: 40,
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'SafaaRoo',
                  style: Theme.of(context).textTheme.displayLarge,
                ),
                const SizedBox(height: 4),
                Text(
                  'School bus tracking made simple',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 32),

                // ── Form Card ─────────────────────────────────────────────
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.border),
                    boxShadow: const [
                      BoxShadow(
                        color: AppColors.shadow,
                        blurRadius: 12,
                        offset: Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Title
                        Text(
                          _isLogin ? 'Welcome Back' : 'Create Account',
                          style: Theme.of(context).textTheme.headlineMedium,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _isLogin
                              ? 'Sign in to your account'
                              : 'Register as an operator, driver, or parent',
                          style: Theme.of(context).textTheme.bodyMedium,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 24),

                        // Error Banner
                        if (authProvider.error != null) ...[
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: AppColors.errorLight,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                  color: AppColors.error.withValues(alpha: 0.3)),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.error_outline,
                                    size: 18, color: AppColors.error),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    authProvider.error!,
                                    style: const TextStyle(
                                      color: AppColors.error,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],

                        // Name (register only)
                        if (!_isLogin) ...[
                          TextFormField(
                            controller: _nameController,
                            decoration: const InputDecoration(
                              labelText: 'Full Name',
                              prefixIcon: Icon(Icons.person_outline),
                            ),
                            validator: (v) =>
                                (v == null || v.trim().isEmpty)
                                    ? 'Name is required'
                                    : null,
                          ),
                          const SizedBox(height: 14),
                        ],

                        // Mobile
                        TextFormField(
                          controller: _mobileController,
                          keyboardType: TextInputType.phone,
                          decoration: const InputDecoration(
                            labelText: 'Mobile Number',
                            prefixIcon: Icon(Icons.phone_outlined),
                          ),
                          validator: (v) =>
                              (v == null || v.trim().isEmpty)
                                  ? 'Mobile is required'
                                  : null,
                        ),
                        const SizedBox(height: 14),

                        // Password
                        TextFormField(
                          controller: _passwordController,
                          obscureText: _obscurePassword,
                          decoration: InputDecoration(
                            labelText: 'Password',
                            prefixIcon: const Icon(Icons.lock_outline),
                            suffixIcon: IconButton(
                              icon: Icon(
                                _obscurePassword
                                    ? Icons.visibility_off_outlined
                                    : Icons.visibility_outlined,
                                size: 20,
                              ),
                              onPressed: () => setState(() {
                                _obscurePassword = !_obscurePassword;
                              }),
                            ),
                          ),
                          validator: (v) =>
                              (v == null || v.length < 4)
                                  ? 'Password must be at least 4 characters'
                                  : null,
                        ),
                        const SizedBox(height: 14),

                        // ── Register-only fields ────────────────────────────
                        if (!_isLogin) ...[
                          // Role selection chips
                          Text(
                            'I am a:',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            children: [
                              _buildRoleChip('operator', 'Operator',
                                  Icons.admin_panel_settings_outlined),
                              _buildRoleChip('driver', 'Driver',
                                  Icons.local_shipping_outlined),
                              _buildRoleChip(
                                  'parent', 'Parent', Icons.family_restroom),
                            ],
                          ),
                          const SizedBox(height: 14),

                          // Parent: Student Name
                          if (_selectedRole == 'parent') ...[
                            TextFormField(
                              controller: _studentNameController,
                              decoration: const InputDecoration(
                                labelText: 'Student Name',
                                prefixIcon: Icon(Icons.school_outlined),
                              ),
                              validator: (v) =>
                                  (v == null || v.trim().isEmpty)
                                      ? 'Student name is required'
                                      : null,
                            ),
                            const SizedBox(height: 14),
                          ],

                        ],

                        const SizedBox(height: 8),

                        // Submit button
                        SizedBox(
                          height: 50,
                          child: ElevatedButton(
                            onPressed: authProvider.isLoading ? null : _submit,
                            child: authProvider.isLoading
                                ? const SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.5,
                                      color: Colors.white,
                                    ),
                                  )
                                : Text(
                                    _isLogin ? 'Sign In' : 'Create Account',
                                    style: const TextStyle(fontSize: 16),
                                  ),
                          ),
                        ),
                        const SizedBox(height: 16),

                        // Toggle login/register
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              _isLogin
                                  ? "Don't have an account?"
                                  : 'Already have an account?',
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                            TextButton(
                              onPressed: _toggleMode,
                              child: Text(
                                _isLogin ? 'Register' : 'Sign In',
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildRoleChip(String role, String label, IconData icon) {
    final isSelected = _selectedRole == role;
    return ChoiceChip(
      label: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 16,
            color: isSelected ? AppColors.primary : AppColors.textMuted,
          ),
          const SizedBox(width: 4),
          Text(label),
        ],
      ),
      selected: isSelected,
      onSelected: (_) => setState(() => _selectedRole = role),
      selectedColor: AppColors.primaryLight,
      labelStyle: TextStyle(
        color: isSelected ? AppColors.primary : AppColors.textSecondary,
        fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
      ),
      side: BorderSide(
        color: isSelected ? AppColors.primary : AppColors.border,
      ),
    );
  }
}
