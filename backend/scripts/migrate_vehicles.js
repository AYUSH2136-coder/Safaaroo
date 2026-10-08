const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, '../location_tracker.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to db:', err.message);
    process.exit(1);
  }
});

db.serialize(() => {
  db.run('BEGIN TRANSACTION');

  db.run(`CREATE TABLE vehicles_new (
    vehicle_id     TEXT PRIMARY KEY,
    operator_id    TEXT NOT NULL,
    driver_id      TEXT,
    school_id      TEXT,
    vehicle_name   TEXT,
    legacy_slot_label TEXT,
    status         TEXT DEFAULT 'inactive',
    created_at     TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (operator_id) REFERENCES users(user_id),
    FOREIGN KEY (driver_id)   REFERENCES users(user_id),
    FOREIGN KEY (school_id)   REFERENCES schools(school_id)
  )`);

  db.run(`INSERT INTO vehicles_new (vehicle_id, operator_id, driver_id, school_id, vehicle_name, legacy_slot_label, status, created_at)
          SELECT vehicle_id, operator_id, driver_id, school_id, vehicle_name, legacy_slot_label, status, created_at FROM vehicles`);

  db.run('DROP TABLE vehicles');
  db.run('ALTER TABLE vehicles_new RENAME TO vehicles');

  db.run('COMMIT', (err) => {
    if (err) {
      console.error('Commit failed:', err);
      process.exit(1);
    }
    console.log('Migration successful: made vehicles.school_id nullable');
    process.exit(0);
  });
});
