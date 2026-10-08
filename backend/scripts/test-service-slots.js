const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safaaroo-service-slots-'));
process.env.SQLITE_DB_PATH = path.join(tempDir, 'service-slots.sqlite');
process.env.JWT_SECRET = `slot-test-${randomUUID()}`;

const db = require('../config/db');
const operatorController = require('../controllers/operatorController');
const parentController = require('../controllers/parentController');
const driverController = require('../controllers/driverController');

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});

const call = async (handler, req) => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handler(req, res);
  return res;
};

async function main() {
  try {
    await db.ready;
    const operatorId = 'operator-test';
    const otherOperatorId = 'other-operator-test';
    const driverOneId = 'driver-one-test';
    const driverTwoId = 'driver-two-test';
    const parentId = 'parent-test';
    const schoolOneId = 'school-one-test';
    const schoolTwoId = 'school-two-test';
    const otherSchoolId = 'other-school-test';

    for (const [userId, role] of [
      [operatorId, 'operator'],
      [otherOperatorId, 'operator'],
      [driverOneId, 'driver'],
      [driverTwoId, 'driver'],
      [parentId, 'parent'],
    ]) {
      await run(
        `INSERT INTO users (user_id, name, mobile, password, role) VALUES (?, ?, ?, ?, ?)`,
        [userId, userId, `${userId}-mobile`, 'test-hash', role],
      );
    }
    for (const [schoolId, ownerId, name] of [
      [schoolOneId, operatorId, 'North School'],
      [schoolTwoId, operatorId, 'South School'],
      [otherSchoolId, otherOperatorId, 'Other School'],
    ]) {
      await run(
        `INSERT INTO schools (school_id, operator_id, school_name, latitude, longitude)
         VALUES (?, ?, ?, 1, 1)`,
        [schoolId, ownerId, name],
      );
    }
    for (const [driverId, name] of [[driverOneId, 'Driver One'], [driverTwoId, 'Driver Two']]) {
      await run(
        `INSERT INTO driver_profiles (profile_id, user_id, is_under_operator, operator_id)
         VALUES (?, ?, 1, ?)`,
        [`profile-${driverId}`, driverId, operatorId],
      );
      await run(
        `UPDATE users SET name = ? WHERE user_id = ?`,
        [name, driverId],
      );
    }
    await run(
      `INSERT INTO parent_profiles (profile_id, user_id, student_name) VALUES (?, ?, 'Test Student')`,
      ['parent-profile-test', parentId],
    );

    const operatorReq = (body = {}) => ({ user: { user_id: operatorId }, body, method: 'POST' });
    const create = await call(operatorController.addVehicle, operatorReq({
      vehicle_id: 'BUS-101',
      vehicle_name: 'North Runner',
      driver_id: driverOneId,
      school_ids: [schoolOneId, schoolTwoId],
    }));
    assert.equal(create.statusCode, 201);
    const slotNo = create.body.slot_no;
    assert.equal(Number.isSafeInteger(slotNo), true);
    assert.equal(create.body.vehicle.vehicle_id, 'BUS-101');

    const slotsResponse = await call(operatorController.getSlots, { user: { user_id: operatorId } });
    assert.equal(slotsResponse.statusCode, 200);
    assert.deepEqual(
      slotsResponse.body.slots[0].schools.map((school) => school.school_id).sort(),
      [schoolOneId, schoolTwoId].sort(),
    );

    const parentSave = await call(parentController.updateProfile, {
      user: { user_id: parentId },
      body: { school_id: schoolTwoId, slot_no: slotNo },
    });
    assert.equal(parentSave.statusCode, 200);
    const parentSlotsForSecondSchool = await call(parentController.getVehicles, {
      query: { school_id: schoolTwoId },
    });
    assert.equal(parentSlotsForSecondSchool.statusCode, 200);
    assert.deepEqual(
      parentSlotsForSecondSchool.body.vehicles.map((slot) => slot.slot_no),
      [slotNo],
    );
    const parentSlotsForFirstSchool = await call(parentController.getVehicles, {
      query: { school_id: schoolOneId },
    });
    assert.deepEqual(
      parentSlotsForFirstSchool.body.vehicles.map((slot) => slot.slot_no),
      [slotNo],
    );
    assert.equal(parentSlotsForSecondSchool.body.vehicles[0].vehicle_id, 'BUS-101');

    const unavailableSlot = await call(parentController.updateProfile, {
      user: { user_id: parentId },
      body: { school_id: otherSchoolId, slot_no: slotNo },
    });
    assert.equal(unavailableSlot.statusCode, 400);
    const parentProfile = await call(parentController.getProfile, { user: { user_id: parentId } });
    assert.equal(parentProfile.body.profile.slot_no, slotNo);
    assert.equal(parentProfile.body.profile.vehicle_id, 'BUS-101');

    const replacement = await call(operatorController.updateSlot, {
      user: { user_id: operatorId },
      params: { slotNo: String(slotNo) },
      method: 'PUT',
      body: {
        vehicle_id: 'BUS-202',
        vehicle_name: 'Replacement Runner',
        driver_id: driverTwoId,
        school_ids: [schoolOneId, schoolTwoId],
      },
    });
    assert.equal(replacement.statusCode, 200);
    assert.equal(replacement.body.slot_no, slotNo);

    const replacedParentProfile = await call(parentController.getProfile, { user: { user_id: parentId } });
    assert.equal(replacedParentProfile.body.profile.slot_no, slotNo);
    assert.equal(replacedParentProfile.body.profile.vehicle_id, 'BUS-202');
    assert.equal((await get(`SELECT vehicle_id FROM driver_profiles WHERE user_id = ?`, [driverOneId])).vehicle_id, null);
    assert.equal((await get(`SELECT vehicle_id FROM driver_profiles WHERE user_id = ?`, [driverTwoId])).vehicle_id, 'BUS-202');

    const crossOperatorSchool = await call(operatorController.updateSlot, {
      user: { user_id: operatorId },
      params: { slotNo: String(slotNo) },
      method: 'PUT',
      body: { vehicle_id: 'BUS-303', school_ids: [otherSchoolId] },
    });
    assert.equal(crossOperatorSchool.statusCode, 403);

    const removeParentSchoolFromSlot = await call(operatorController.updateSlot, {
      user: { user_id: operatorId },
      params: { slotNo: String(slotNo) },
      method: 'PUT',
      body: { vehicle_id: 'BUS-202', driver_id: driverTwoId, school_ids: [schoolOneId] },
    });
    assert.equal(removeParentSchoolFromSlot.statusCode, 200);
    const parentAfterSchoolRemoval = await call(parentController.getProfile, { user: { user_id: parentId } });
    assert.equal(parentAfterSchoolRemoval.body.profile.slot_no, null);
    assert.equal(parentAfterSchoolRemoval.body.profile.vehicle_id, null);

    const deleteAssigned = await call(operatorController.deleteVehicle, {
      user: { user_id: operatorId },
      params: { id: 'BUS-202' },
    });
    assert.equal(deleteAssigned.statusCode, 409);

    await run(`UPDATE vehicles SET driver_id = NULL, status = 'inactive' WHERE vehicle_id = 'BUS-202'`);
    await run(`UPDATE driver_profiles SET vehicle_id = NULL, operator_id = NULL WHERE user_id IN (?, ?)`, [driverOneId, driverTwoId]);

    const unknownVehicle = await call(driverController.addVehicle, {
      user: { user_id: driverOneId },
      body: { vehicle_id: 'UNKNOWN-1' },
    });
    assert.equal(unknownVehicle.statusCode, 404);
    assert.equal(unknownVehicle.body.code, 'VEHICLE_NOT_REGISTERED');

    const driverAdd = await call(driverController.addVehicle, {
      user: { user_id: driverOneId },
      body: { vehicle_id: ' bus-202 ' },
    });
    assert.equal(driverAdd.statusCode, 201);
    const duplicateAdd = await call(driverController.addVehicle, {
      user: { user_id: driverOneId },
      body: { vehicle_id: 'BUS-202' },
    });
    assert.equal(duplicateAdd.statusCode, 409);
    assert.equal(duplicateAdd.body.code, 'VEHICLE_ALREADY_ADDED');
    assert.equal((await call(driverController.addVehicle, {
      user: { user_id: driverTwoId },
      body: { vehicle_id: 'BUS-202' },
    })).statusCode, 201);

    const details = await call(driverController.getVehicleDetails, {
      user: { user_id: driverOneId },
      params: { vehicleId: 'BUS-202' },
    });
    assert.equal(details.statusCode, 200);
    assert.equal(details.body.vehicle.slot_no, slotNo);
    assert.equal(details.body.vehicle.operator_name, operatorId);
    assert.deepEqual(details.body.vehicle.schools.map((school) => school.school_id), [schoolOneId]);

    const start = await call(driverController.startTransmission, {
      user: { user_id: driverOneId },
      body: { vehicle_id: 'BUS-202' },
    });
    assert.equal(start.statusCode, 200);
    assert.equal((await get(`SELECT driver_id, status FROM vehicles WHERE vehicle_id = 'BUS-202'`)).driver_id, driverOneId);
    const competingStart = await call(driverController.startTransmission, {
      user: { user_id: driverTwoId },
      body: { vehicle_id: 'BUS-202' },
    });
    assert.equal(competingStart.statusCode, 409);

    const stop = await call(driverController.stopTransmission, { user: { user_id: driverOneId } });
    assert.equal(stop.statusCode, 200);
    assert.equal((await get(`SELECT driver_id, status FROM vehicles WHERE vehicle_id = 'BUS-202'`)).driver_id, null);
    assert.equal((await get(`SELECT vehicle_id FROM driver_profiles WHERE user_id = ?`, [driverOneId])).vehicle_id, null);
    assert.equal((await get(`SELECT vehicle_id FROM driver_vehicle_history WHERE driver_id = ?`, [driverOneId])).vehicle_id, 'BUS-202');
    assert.equal((await call(driverController.startTransmission, {
      user: { user_id: driverTwoId },
      body: { vehicle_id: 'BUS-202' },
    })).statusCode, 200);
    await call(driverController.stopTransmission, { user: { user_id: driverTwoId } });

    console.log(JSON.stringify({
      createdSlot: slotNo,
      linkedSchools: slotsResponse.body.slots[0].schools.length,
      bothSchoolsResolveSameSlot: true,
      crossSchoolSlotSelectionRejected: unavailableSlot.statusCode === 400,
      parentVehicleAfterSwap: replacedParentProfile.body.profile.vehicle_id,
      driverSwapSynchronized: true,
      crossOperatorAssignmentRejected: crossOperatorSchool.statusCode === 403,
      parentAssignmentClearedWhenSchoolRemoved: parentAfterSchoolRemoval.body.profile.slot_no === null,
      assignedVehicleDeletionRejected: deleteAssigned.statusCode === 409,
      unknownAndDuplicateVehicleAddsDistinguished: true,
      detailIncludesSlotOperatorAndSchools: true,
      activeVehicleClaimIsExclusive: competingStart.statusCode === 409,
      stopReleasesClaimAndKeepsHistory: true,
    }, null, 2));
  } finally {
    await new Promise((resolve) => db.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});