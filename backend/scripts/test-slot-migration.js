const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();

const sourcePath = process.argv[2];
if (!sourcePath || !fs.existsSync(sourcePath)) {
  throw new Error('Pass the path to an existing SQLite database as the first argument.');
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safaaroo-slot-migration-'));
const testPath = path.join(tempDir, 'migration.sqlite');
fs.copyFileSync(sourcePath, testPath);

const queryAll = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

const close = (db) => new Promise((resolve, reject) => {
  db.close((err) => err ? reject(err) : resolve());
});

const baselineDb = new sqlite3.Database(sourcePath);
const baselineReady = new Promise((resolve, reject) => {
  baselineDb.get('PRAGMA foreign_keys = ON', (err) => err ? reject(err) : resolve());
});

async function main() {
  try {
    await baselineReady;
    const baselineForeignKeyErrors = await queryAll(baselineDb, 'PRAGMA foreign_key_check');
    const baselineVehicleLabels = await queryAll(
      baselineDb,
      `SELECT v.vehicle_id, v.slot_no AS legacy_slot_label
       FROM vehicles v JOIN schools s
         ON s.school_id = v.school_id AND s.operator_id = v.operator_id
       ORDER BY v.vehicle_id`,
    );
    await close(baselineDb);

    process.env.SQLITE_DB_PATH = testPath;
    const db = require('../config/db');
    await db.ready;

    const eligibleVehicles = (await queryAll(
      db,
      `SELECT COUNT(*) AS count
       FROM vehicles v JOIN schools s
         ON s.school_id = v.school_id AND s.operator_id = v.operator_id`,
    ))[0].count;
    const slotCount = (await queryAll(db, 'SELECT COUNT(*) AS count FROM service_slots'))[0].count;
    const unmappedParents = (await queryAll(
      db,
      `SELECT COUNT(*) AS count
       FROM parent_profiles pp
       JOIN vehicles v ON v.vehicle_id = pp.vehicle_id
       JOIN schools s ON s.school_id = v.school_id AND s.operator_id = v.operator_id
       WHERE pp.slot_no IS NULL`,
    ))[0].count;
    const missingSchoolLinks = (await queryAll(
      db,
      `SELECT COUNT(*) AS count
       FROM vehicles v
       JOIN schools s ON s.school_id = v.school_id AND s.operator_id = v.operator_id
       JOIN service_slots ss ON ss.vehicle_id = v.vehicle_id
       LEFT JOIN service_slot_schools sss
         ON sss.slot_no = ss.slot_no AND sss.school_id = v.school_id
       WHERE sss.slot_no IS NULL`,
    ))[0].count;
    const migratedForeignKeyErrors = await queryAll(db, 'PRAGMA foreign_key_check');
    const migratedVehicleLabels = await queryAll(
      db,
      `SELECT ss.vehicle_id, ss.legacy_slot_label
       FROM service_slots ss
       JOIN vehicles v ON v.vehicle_id = ss.vehicle_id
       JOIN schools s ON s.school_id = v.school_id AND s.operator_id = v.operator_id
       ORDER BY ss.vehicle_id`,
    );

    assert.equal(slotCount, eligibleVehicles, 'Every managed school vehicle should receive one slot.');
    assert.equal(unmappedParents, 0, 'Existing parents with a managed vehicle should map to its slot.');
    assert.equal(missingSchoolLinks, 0, 'Existing school assignments should be preserved as slot links.');
    assert.deepEqual(
      migratedVehicleLabels,
      baselineVehicleLabels,
      'Legacy per-school labels must remain mapped to the new stable slots.',
    );
    assert.deepEqual(
      migratedForeignKeyErrors,
      baselineForeignKeyErrors,
      'Migration must not add or remove existing foreign-key violations.',
    );

    console.log(JSON.stringify({
      migratedManagedVehicles: eligibleVehicles,
      slots: slotCount,
      parentAssignmentsWithoutSlots: unmappedParents,
      missingSchoolLinks,
      preExistingForeignKeyViolationsPreserved: migratedForeignKeyErrors.length,
    }, null, 2));
    await close(db);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});