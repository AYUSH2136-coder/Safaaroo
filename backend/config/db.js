
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Path where the SQLite database file will be created/stored
const dbPath = process.env.SQLITE_DB_PATH || path.resolve(__dirname, '../location_tracker.db');
const migrationBackupPath = `${dbPath}.pre-slot-migration.bak`;

if (fs.existsSync(dbPath) && !fs.existsSync(migrationBackupPath)) {
  fs.copyFileSync(dbPath, migrationBackupPath);
}

// Connect to (or create) the SQLite database file
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error connecting to SQLite database:', err.message);
  } else {
    console.log('📦 Connected to SQLite database at:', dbPath);
  }
});

// Initialize database schema (create all tables if they don't exist)
const initDb = () => {
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  db.serialize(() => {
    // ─── Existing: Devices table ───────────────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS devices (
        device_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        device_name TEXT NOT NULL,
        status TEXT DEFAULT 'offline',
        latitude REAL,
        longitude REAL,
        last_update INTEGER,
        is_transmitting INTEGER DEFAULT 0,
        push_subscription TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('❌ Error creating devices table:', err.message);
      else console.log('✅ Devices table ready.');
    });

    // Migration: Add push_subscription column if table already existed without it
    db.run(`ALTER TABLE devices ADD COLUMN push_subscription TEXT`, (alterErr) => {
      if (alterErr && !alterErr.message.includes('duplicate column')) {
        // Silently ignore — column already exists
      }
    });

    // ─── Routes table ──────────────────────────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS routes (
        route_id    TEXT PRIMARY KEY,
        route_name  TEXT NOT NULL,
        description TEXT,
        created_at  TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('❌ Error creating routes table:', err.message);
      else console.log('✅ Routes table ready.');
    });

    // ─── Stops table (ordered per route with geofence radii) ───────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS stops (
        stop_id           TEXT PRIMARY KEY,
        route_id          TEXT NOT NULL,
        stop_name         TEXT NOT NULL,
        sequence_no       INTEGER NOT NULL,
        latitude          REAL NOT NULL,
        longitude         REAL NOT NULL,
        approach_radius_m REAL DEFAULT 500,
        arrival_radius_m  REAL DEFAULT 100,
        created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (route_id) REFERENCES routes(route_id)
      )
    `, (err) => {
      if (err) console.error('❌ Error creating stops table:', err.message);
      else console.log('✅ Stops table ready.');
    });

    // ─── Bus Live State (state machine per bus) ────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS bus_live_state (
        bus_id           TEXT PRIMARY KEY,
        route_id         TEXT,
        current_stop_id  TEXT,
        next_stop_id     TEXT,
        state            TEXT DEFAULT 'OUTSIDE',
        latitude         REAL,
        longitude        REAL,
        speed            REAL DEFAULT 0,
        last_event       TEXT,
        last_event_time  TEXT,
        updated_at       TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (route_id)        REFERENCES routes(route_id),
        FOREIGN KEY (current_stop_id) REFERENCES stops(stop_id),
        FOREIGN KEY (next_stop_id)    REFERENCES stops(stop_id)
      )
    `, (err) => {
      if (err) console.error('❌ Error creating bus_live_state table:', err.message);
      else console.log('✅ Bus Live State table ready.');
    });

    // ─── Notification Log (deduplication) ──────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS notification_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        bus_id      TEXT NOT NULL,
        stop_id     TEXT NOT NULL,
        event_type  TEXT NOT NULL,
        sent_at     TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(bus_id, stop_id, event_type)
      )
    `, (err) => {
      if (err) console.error('❌ Error creating notification_log table:', err.message);
      else console.log('✅ Notification Log table ready.');
    });

    // ─── Stop Subscribers (per-stop SMS subscriptions) ─────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS stop_subscribers (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        stop_id  TEXT NOT NULL,
        phone    TEXT NOT NULL,
        FOREIGN KEY (stop_id) REFERENCES stops(stop_id)
      )
    `, (err) => {
      if (err) console.error('❌ Error creating stop_subscribers table:', err.message);
      else console.log('✅ Stop Subscribers table ready.');
    });

    // ─── Users (all roles: operator, driver, parent) ───────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        user_id    TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        mobile     TEXT NOT NULL UNIQUE,
        password   TEXT NOT NULL,
        role       TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('❌ Error creating users table:', err.message);
      else console.log('✅ Users table ready.');
    });

    // ─── Schools (registered by Operator) ─────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS schools (
        school_id   TEXT PRIMARY KEY,
        operator_id TEXT NOT NULL,
        school_name TEXT NOT NULL,
        latitude    REAL NOT NULL,
        longitude   REAL NOT NULL,
        address     TEXT,
        created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (operator_id) REFERENCES users(user_id)
      )
    `, (err) => {
      if (err) console.error('❌ Error creating schools table:', err.message);
      else console.log('✅ Schools table ready.');
    });

    // ─── Vehicles (buses registered by Operator) ───────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS vehicles (
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
      )
    `, (err) => {
      if (err) console.error('❌ Error creating vehicles table:', err.message);
      else console.log('✅ Vehicles table ready.');
    });

    // ─── Parent Profiles ───────────────────────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS parent_profiles (
        profile_id    TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL UNIQUE,
        student_name  TEXT NOT NULL,
        school_id     TEXT,
        vehicle_id    TEXT,
        slot_no       INTEGER,
        home_lat      REAL,
        home_lng      REAL,
        notify_pref   TEXT DEFAULT 'sms',
        created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id)    REFERENCES users(user_id),
        FOREIGN KEY (school_id)  REFERENCES schools(school_id),
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id)
      )
    `, (err) => {
      if (err) console.error('❌ Error creating parent_profiles table:', err.message);
      else console.log('✅ Parent Profiles table ready.');
    });

    // ─── Driver Profiles ───────────────────────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS driver_profiles (
        profile_id        TEXT PRIMARY KEY,
        user_id           TEXT NOT NULL UNIQUE,
        operator_id       TEXT,
        vehicle_id        TEXT,
        is_under_operator INTEGER DEFAULT 1,
        created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id)    REFERENCES users(user_id),
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id)
      )
    `, (err) => {
      if (err) console.error('❌ Error creating driver_profiles table:', err.message);
      else console.log('✅ Driver Profiles table ready.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS driver_vehicle_history (
        driver_id        TEXT NOT NULL,
        vehicle_id       TEXT NOT NULL,
        added_at         TEXT DEFAULT CURRENT_TIMESTAMP,
        last_selected_at TEXT,
        last_driven_at   TEXT,
        PRIMARY KEY (driver_id, vehicle_id),
        FOREIGN KEY (driver_id) REFERENCES users(user_id),
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS service_slots (
        slot_no           INTEGER PRIMARY KEY AUTOINCREMENT,
        operator_id       TEXT NOT NULL,
        vehicle_id        TEXT UNIQUE,
        legacy_slot_label TEXT,
        created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (operator_id) REFERENCES users(user_id),
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id)
      )
    `);
    db.run(`ALTER TABLE service_slots ADD COLUMN legacy_slot_label TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('❌ Could not add legacy slot label mapping:', err.message);
      }
    });
    db.run(`ALTER TABLE service_slots ADD COLUMN slot_name TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        // Column already exists — safe to ignore
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS service_slot_schools (
        slot_no   INTEGER NOT NULL,
        school_id TEXT NOT NULL,
        PRIMARY KEY (slot_no, school_id),
        FOREIGN KEY (slot_no) REFERENCES service_slots(slot_no),
        FOREIGN KEY (school_id) REFERENCES schools(school_id)
      )
    `);

    // ─── Slot Assignments (which Bus+Driver currently serve a Slot) ────────
    db.run(`
      CREATE TABLE IF NOT EXISTS slot_assignments (
        assignment_id TEXT PRIMARY KEY,
        slot_no       INTEGER NOT NULL,
        vehicle_id    TEXT NOT NULL,
        driver_id     TEXT,
        status        TEXT DEFAULT 'ACTIVE',
        assigned_at   TEXT DEFAULT CURRENT_TIMESTAMP,
        ended_at      TEXT,
        FOREIGN KEY (slot_no)    REFERENCES service_slots(slot_no),
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id),
        FOREIGN KEY (driver_id)  REFERENCES users(user_id)
      )
    `, (err) => {
      if (err) console.error('❌ Error creating slot_assignments table:', err.message);
      else console.log('✅ Slot Assignments table ready.');
    });

    // ─── Transmission Sessions (driver's active GPS transmission) ──────────
    db.run(`
      CREATE TABLE IF NOT EXISTS transmission_sessions (
        session_id  TEXT PRIMARY KEY,
        driver_id   TEXT NOT NULL,
        vehicle_id  TEXT NOT NULL,
        slot_no     INTEGER,
        device_id   TEXT,
        status      TEXT DEFAULT 'ACTIVE',
        started_at  TEXT DEFAULT CURRENT_TIMESTAMP,
        ended_at    TEXT,
        last_lat    REAL,
        last_lng    REAL,
        last_speed  REAL,
        last_update TEXT,
        FOREIGN KEY (driver_id)  REFERENCES users(user_id),
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id),
        FOREIGN KEY (slot_no)    REFERENCES service_slots(slot_no)
      )
    `, (err) => {
      if (err) console.error('❌ Error creating transmission_sessions table:', err.message);
      else console.log('✅ Transmission Sessions table ready.');
    });

    // Upgrade databases created before stable numeric service slots.
    db.run(
      `ALTER TABLE vehicles RENAME COLUMN slot_no TO legacy_slot_label`,
      (err) => {
        if (err && !err.message.includes('no such column')) {
          console.error('❌ Could not preserve legacy slot labels:', err.message);
        }
      },
    );
    db.run(`ALTER TABLE parent_profiles ADD COLUMN slot_no INTEGER`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('❌ Could not add parent slot reference:', err.message);
      }
    });

    // ─── Parent Routes (multi-route support) ─────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS parent_routes (
        route_id      TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL,
        route_name    TEXT NOT NULL,
        school_id     TEXT,
        slot_no       INTEGER,
        home_lat      REAL,
        home_lng      REAL,
        notify_pref   TEXT DEFAULT 'none',
        created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id)   REFERENCES users(user_id),
        FOREIGN KEY (school_id) REFERENCES schools(school_id),
        FOREIGN KEY (slot_no)   REFERENCES service_slots(slot_no)
      )
    `, (err) => {
      if (err) console.error('❌ Error creating parent_routes table:', err.message);
      else console.log('✅ Parent Routes table ready.');
    });

    // ─── Parent Routes: custom school & pickup columns ───────────────────
    db.run(`ALTER TABLE parent_routes ADD COLUMN custom_school_name TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('❌ Could not add custom_school_name:', err.message);
      }
    });
    db.run(`ALTER TABLE parent_routes ADD COLUMN custom_school_lat REAL`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('❌ Could not add custom_school_lat:', err.message);
      }
    });
    db.run(`ALTER TABLE parent_routes ADD COLUMN custom_school_lng REAL`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('❌ Could not add custom_school_lng:', err.message);
      }
    });
    db.run(`ALTER TABLE parent_routes ADD COLUMN pickup_name TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('❌ Could not add pickup_name:', err.message);
      }
    });

    db.run(`ALTER TABLE driver_profiles ADD COLUMN operator_id TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('❌ Could not add driver operator ownership:', err.message);
      }
    });

    db.run(
      `INSERT INTO service_slots (operator_id, vehicle_id, legacy_slot_label)
       SELECT v.operator_id, v.vehicle_id, v.legacy_slot_label
       FROM vehicles v
       JOIN schools s ON s.school_id = v.school_id AND s.operator_id = v.operator_id
       WHERE NOT EXISTS (
         SELECT 1 FROM service_slots ss WHERE ss.vehicle_id = v.vehicle_id
       )
       ORDER BY v.created_at, v.vehicle_id`,
      (err) => {
        if (err) {
          rejectReady(err);
          return;
        }
        db.run(
          `INSERT OR IGNORE INTO service_slot_schools (slot_no, school_id)
           SELECT ss.slot_no, v.school_id
           FROM service_slots ss
           JOIN vehicles v ON v.vehicle_id = ss.vehicle_id
           JOIN schools s ON s.school_id = v.school_id AND s.operator_id = ss.operator_id`,
          (schoolLinkErr) => {
            if (schoolLinkErr) {
              rejectReady(schoolLinkErr);
              return;
            }
            db.run(
              `UPDATE parent_profiles
               SET slot_no = (
                 SELECT ss.slot_no FROM service_slots ss
                 WHERE ss.vehicle_id = parent_profiles.vehicle_id
               )
               WHERE slot_no IS NULL AND vehicle_id IS NOT NULL`,
              (parentSlotErr) => {
                if (parentSlotErr) {
                  rejectReady(parentSlotErr);
                  return;
                }
                db.run(
                  `UPDATE driver_profiles
                   SET operator_id = (
                     SELECT v.operator_id FROM vehicles v
                     WHERE v.vehicle_id = driver_profiles.vehicle_id
                   )
                   WHERE operator_id IS NULL AND vehicle_id IS NOT NULL AND is_under_operator = 1`,
                  (driverOwnerErr) => {
                    if (driverOwnerErr) {
                      rejectReady(driverOwnerErr);
                      return;
                    }
                    db.run(
                      `UPDATE parent_profiles
                       SET vehicle_id = (
                         SELECT ss.vehicle_id FROM service_slots ss
                         WHERE ss.slot_no = parent_profiles.slot_no
                       )
                       WHERE slot_no IS NOT NULL`,
                      (parentVehicleErr) => {
                        if (parentVehicleErr) {
                          rejectReady(parentVehicleErr);
                          return;
                        }
                        db.run(
                          `INSERT OR IGNORE INTO driver_vehicle_history (driver_id, vehicle_id)
                           SELECT user_id, vehicle_id FROM driver_profiles
                           WHERE vehicle_id IS NOT NULL`,
                          (historyErr) => {
                            if (historyErr) rejectReady(historyErr);
                            else resolveReady();
                          },
                        );
                      },
                    );
                  },
                );
              },
            );
          },
        );
      },
    );
  });

  return ready;
};

// Execute table initialization
db.ready = initDb();

module.exports = db;