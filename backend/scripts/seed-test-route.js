/**
 * seed-test-route.js — Test Data Seeder for Stop Detection
 *
 * Creates a sample Bhopal bus route with realistic stop coordinates,
 * assigns a test bus, and adds sample subscribers.
 *
 * Usage: node scripts/seed-test-route.js
 *
 * After seeding, use simulate-gps.js to test the detection pipeline.
 */

const API_BASE = process.env.API_BASE || 'http://localhost:5000/api';

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  console.log(`${res.status} ${path}:`, data.message || JSON.stringify(data));
  return data;
}

async function seed() {
  console.log('🌱 Seeding test route data...\n');

  // ─── 1. Create a route ────────────────────────────────────────────────
  await post('/routes', {
    route_id: 'bhopal-route-1',
    route_name: 'Bhopal City Route 1',
    description: 'Habibganj → New Market → Bittan Market → Board Office → ISBT'
  });

  // ─── 2. Add stops with realistic Bhopal coordinates ──────────────────
  const stops = [
    {
      stop_id: 'stop-habibganj',
      stop_name: 'Habibganj Station',
      sequence_no: 1,
      latitude: 23.2295,
      longitude: 77.4380,
      approach_radius_m: 400,
      arrival_radius_m: 80
    },
    {
      stop_id: 'stop-new-market',
      stop_name: 'New Market',
      sequence_no: 2,
      latitude: 23.2330,
      longitude: 77.4233,
      approach_radius_m: 350,
      arrival_radius_m: 70
    },
    {
      stop_id: 'stop-bittan-market',
      stop_name: 'Bittan Market',
      sequence_no: 3,
      latitude: 23.2375,
      longitude: 77.4170,
      approach_radius_m: 300,
      arrival_radius_m: 60
    },
    {
      stop_id: 'stop-board-office',
      stop_name: 'Board Office',
      sequence_no: 4,
      latitude: 23.2545,
      longitude: 77.4125,
      approach_radius_m: 350,
      arrival_radius_m: 75
    },
    {
      stop_id: 'stop-isbt',
      stop_name: 'ISBT Bhopal',
      sequence_no: 5,
      latitude: 23.2670,
      longitude: 77.4120,
      approach_radius_m: 400,
      arrival_radius_m: 100
    }
  ];

  await post('/routes/bhopal-route-1/stops', { stops });

  // ─── 3. Assign a test bus ─────────────────────────────────────────────
  // Use an existing device_id or create a new one
  await post('/routes/assign-bus', {
    bus_id: 'test_bus_01',
    route_id: 'bhopal-route-1'
  });

  // ─── 4. Add sample subscriber to stop 2 (New Market) ─────────────────
  await post('/routes/subscribe', {
    stop_id: 'stop-new-market',
    phone: '+919876543210'
  });

  await post('/routes/subscribe', {
    stop_id: 'stop-bittan-market',
    phone: '+919876543210'
  });

  console.log('\n✅ Seed complete! You can now:');
  console.log('   1. Run: node scripts/simulate-gps.js');
  console.log('   2. Or POST to /api/location/update with GPS coordinates');
  console.log('   3. Open http://localhost:5000/bus-tracker in the browser');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
