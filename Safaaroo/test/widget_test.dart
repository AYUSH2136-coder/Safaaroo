// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter_test/flutter_test.dart';

import 'package:safaaroo/models/vehicle.dart';

void main() {
  test('formats numeric slot labels with the SLOT prefix', () {
    final vehicle = Vehicle(vehicleId: 'BUS-1', slotNo: 1);

    expect(vehicle.formattedSlotNo, 'SLOT-001');
  });

  test('does not truncate slot labels above three digits', () {
    final vehicle = Vehicle(vehicleId: 'BUS-1000', slotNo: 1000);

    expect(vehicle.formattedSlotNo, 'SLOT-1000');
  });

  test('parses integer slot and multiple school names from API JSON', () {
    final vehicle = Vehicle.fromJson({
      'vehicle_id': 'BUS-1',
      'slot_no': 7,
      'school_ids': ['school-a', 'school-b'],
      'school_names': ['North', 'South'],
      'status': 'inactive',
    });

    expect(vehicle.slotNo, 7);
    expect(vehicle.formattedSlotNo, 'SLOT-007');
    expect(vehicle.schoolIds, ['school-a', 'school-b']);
    expect(vehicle.schoolNames, ['North', 'South']);
  });
}
