/**
 * setup-real-test.js — Quick Real-World Test Setup
 *
 * Creates a route with 3 stops near a given starting location.
 * You provide your current GPS coordinates, and this script creates
 * stops at walkable distances (50m, 150m, 300m apart) so you can
 * physically walk between them and test the detection system.
 *
 * Usage:
 *   node scripts/setup-real-test.js <lat> <lon> <device_id>
 *
 * Example:
 *   node scripts/setup-real-test.js 23.2599 77.4126 ayush_redmi
 *
 * The script creates 3 stops spread north of your current position.
 * Walk north from your starting point to trigger all transitions.
 */

const API_BASE = process.env.API_BASE || 'http://localhost:5000/api';

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 3) {
  console.log('Usage: node scripts/setup-real-test.js <your_latitude> <your_longitude> <your_device_id>');
  console.log('');
  console.log('Example: node scripts/setup-real-test.js 23.2599 77.4126 ayush_redmi');
  console.log('');
  console.log('How to get your coordinates:');
  console.log('  1. Open Google Maps on your phone');
  console.log('  2. Long-press on your current location');
  console.log('  3. The coordinates appear at the top — copy them');
  console.log('');
  console.log('Your device_id format: <username>_<device_name> (lowercase, spaces → underscores)');
  console.log('  Example: "Ayush" + "Redmi Note 13" → "ayush_redmi_note_13"');
  process.exit(1);
}

const startLat = parseFloat(args[0]);
const startLon = parseFloat(args[1]);
const deviceId = args[2];

// Each degree of latitude ≈ 111,320 meters
// Each degree of longitude ≈ 111,320 * cos(latitude) meters
const METER_PER_DEG_LAT = 111320;
const METER_PER_DEG_LON = 111320 * Math.cos(startLat * Math.PI / 180);

/**
 * Offset a GPS coordinate by meters (north/east)
 */
function offsetCoords(lat, lon, northMeters, eastMeters) {
  return {
    lat: lat + (northMeters / METER_PER_DEG_LAT),
    lon: lon + (eastMeters / METER_PER_DEG_LON)
  };
}

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  const icon = res.ok ? '✅' : '❌';
  console.log(`  ${icon} ${res.status} ${path}: ${data.message || JSON.stringify(data)}`);
  return data;
}

async function setup() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     SafarNama — Real-World Test Setup            ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📍 Your location: (${startLat}, ${startLon})`);
  console.log(`🚌 Device ID:     ${deviceId}`);
  console.log('');

  // Create 3 stops: starting point, +100m north, +250m north
  const stop1 = { lat: startLat, lon: startLon };                      // Your current location
  const stop2 = offsetCoords(startLat, startLon, 100, 0);              // ~100m north
  const stop3 = offsetCoords(startLat, startLon, 250, 0);              // ~250m north

  const routeId = 'real-test-route';
  const routeName = 'Real Test Route';

  console.log('📋 Step 1: Creating route...');
  await post('/routes', {
    route_id: routeId,
    route_name: routeName,
    description: `Test route near (${startLat}, ${startLon})`
  });

  console.log('');
  console.log('📍 Step 2: Adding stops...');
  console.log(`   Stop 1 "Start Point":  (${stop1.lat.toFixed(6)}, ${stop1.lon.toFixed(6)}) — your current spot`);
  console.log(`   Stop 2 "Checkpoint A": (${stop2.lat.toFixed(6)}, ${stop2.lon.toFixed(6)}) — ~100m north`);
  console.log(`   Stop 3 "Destination":  (${stop3.lat.toFixed(6)}, ${stop3.lon.toFixed(6)}) — ~250m north`);
  console.log('');

  await post(`/routes/${routeId}/stops`, {
    stops: [
      {
        stop_id: 'real-stop-1',
        stop_name: 'Start Point',
        sequence_no: 1,
        latitude: stop1.lat,
        longitude: stop1.lon,
        approach_radius_m: 80,   // Tighter for walking test
        arrival_radius_m: 25
      },
      {
        stop_id: 'real-stop-2',
        stop_name: 'Checkpoint A',
        sequence_no: 2,
        latitude: stop2.lat,
        longitude: stop2.lon,
        approach_radius_m: 80,
        arrival_radius_m: 25
      },
      {
        stop_id: 'real-stop-3',
        stop_name: 'Destination',
        sequence_no: 3,
        latitude: stop3.lat,
        longitude: stop3.lon,
        approach_radius_m: 80,
        arrival_radius_m: 25
      }
    ]
  });

  console.log('');
  console.log('🚌 Step 3: Assigning your device as bus...');
  await post('/routes/assign-bus', {
    bus_id: deviceId,
    route_id: routeId
  });

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  console.log('🎉 Setup complete! Now follow these steps:');
  console.log('');
  console.log('  1. Open the app on your phone (or localhost:5000)');
  console.log('  2. Login with the same username and device name');
  console.log('  3. Go to "Transmitter" → Start Transmitting');
  console.log('  4. Open "Bus Tracker" on another device/tab to watch');
  console.log('  5. Walk ~100m north → you should see APPROACHING & ARRIVED');
  console.log('  6. Keep walking → DEPARTED, then APPROACHING next stop');
  console.log('');
  console.log('  🔍 Approach radius: 80m (detection starts at ~80m from stop)');
  console.log('  🎯 Arrival radius:  25m (must be within ~25m and slow/stopped)');
  console.log('');
  console.log('  📊 Dashboard: http://localhost:5000/bus-tracker');
  console.log('');
}

setup().catch((err) => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
