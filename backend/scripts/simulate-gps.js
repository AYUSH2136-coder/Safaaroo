/**
 * simulate-gps.js — GPS Simulation Script for Testing Stop Detection
 *
 * Simulates a bus travelling along the Bhopal Route 1,
 * approaching and arriving at each stop in sequence.
 *
 * Usage: node scripts/simulate-gps.js
 *
 * Prerequisite: Run seed-test-route.js first to create the route.
 */

const API_BASE = process.env.API_BASE || 'http://localhost:5000/api';
const BUS_ID = 'test_bus_01';

// Simulated GPS waypoints along the route
// Each waypoint: [latitude, longitude, speed_kmh, description]
const waypoints = [
  // ─── Start: Far from Habibganj ────────────────────────────────────────
  [23.2230, 77.4450, 30, '🚌 Starting — far from Habibganj'],

  // ─── Approaching Habibganj (within 400m) ─────────────────────────────
  [23.2280, 77.4395, 25, '🟡 Approaching Habibganj'],

  // ─── Arriving at Habibganj (within 80m, speed ~3 km/h) ──────────────
  [23.2293, 77.4382, 3, '🟢 Arriving at Habibganj Station'],

  // ─── Stopped at Habibganj ────────────────────────────────────────────
  [23.2295, 77.4380, 0, '⏸️ Stopped at Habibganj'],

  // ─── Departing Habibganj (moving away > 400m) ────────────────────────
  [23.2310, 77.4340, 28, '🔴 Departing Habibganj → heading to New Market'],

  // ─── Between stops ──────────────────────────────────────────────────
  [23.2318, 77.4300, 35, '🚌 En route to New Market'],

  // ─── Approaching New Market (within 350m) ────────────────────────────
  [23.2325, 77.4255, 20, '🟡 Approaching New Market'],

  // ─── Arriving at New Market ──────────────────────────────────────────
  [23.2329, 77.4235, 4, '🟢 Arriving at New Market'],

  // ─── Stopped at New Market ───────────────────────────────────────────
  [23.2330, 77.4233, 0, '⏸️ Stopped at New Market'],

  // ─── Departing New Market ────────────────────────────────────────────
  [23.2345, 77.4200, 30, '🔴 Departing New Market → heading to Bittan Market'],

  // ─── Approaching Bittan Market ───────────────────────────────────────
  [23.2365, 77.4180, 18, '🟡 Approaching Bittan Market'],

  // ─── Arriving at Bittan Market ───────────────────────────────────────
  [23.2374, 77.4171, 2, '🟢 Arriving at Bittan Market'],

  // ─── Departing Bittan Market ─────────────────────────────────────────
  [23.2420, 77.4140, 32, '🔴 Departing Bittan Market → Board Office'],
];

async function postLocation(lat, lon, speed) {
  const res = await fetch(`${API_BASE}/location/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bus_id: BUS_ID,
      latitude: lat,
      longitude: lon,
      speed: speed,
      timestamp: Date.now()
    })
  });
  return res.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulate() {
  console.log('🗺️  Starting GPS simulation for bus:', BUS_ID);
  console.log('═'.repeat(60));

  for (let i = 0; i < waypoints.length; i++) {
    const [lat, lon, speed, desc] = waypoints[i];

    console.log(`\n[${i + 1}/${waypoints.length}] ${desc}`);
    console.log(`   📍 (${lat}, ${lon}) @ ${speed} km/h`);

    const result = await postLocation(lat, lon, speed);

    if (result.event) {
      console.log(`   ✅ Event detected: ${result.event} → State: ${result.state}`);
    } else {
      console.log(`   ⬜ No transition — State: ${result.state}`);
    }

    // Wait 2 seconds between updates (simulating 5-second GPS interval, compressed)
    await sleep(2000);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('🏁 Simulation complete!');
}

simulate().catch((err) => {
  console.error('❌ Simulation failed:', err.message);
  process.exit(1);
});
