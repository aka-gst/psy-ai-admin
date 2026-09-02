import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createBooking, createSlot, createSpecialist, decideBooking, deleteAvailableSlot, listAvailableSlots, listBookings, listManagedSlots, listSpecialists, openDatabase, purgeExpiredPersonalData, seedSchedule, setSpecialistActive } from "../lib/database.mjs";

const config = { specialists: [{ id: "one", name: "Специалист", description: "Тест" }], slotHours: ["10:00"] };

test("booking holds a slot and manager decision finalizes it", () => {
  const db = openDatabase(join(mkdtempSync(join(tmpdir(), "psy-v2-")), "test.sqlite"));
  seedSchedule(db, config, new Date("2026-08-23T00:00:00Z"));
  const before = listAvailableSlots(db);
  assert.ok(before.length > 0);
  const bookingId = createBooking(db, { slotId: before[0].id, clientName: "Тест", contact: "+70000000000", contactType: "phone" }, "public-code");
  assert.equal(listAvailableSlots(db).some((item) => item.id === before[0].id), false);
  assert.equal(listBookings(db)[0].status, "pending");
  decideBooking(db, bookingId, "confirmed");
  assert.equal(listBookings(db)[0].status, "confirmed");
});

test("rejection returns the held slot to the schedule", () => {
  const db = openDatabase(join(mkdtempSync(join(tmpdir(), "psy-v2-")), "test.sqlite"));
  seedSchedule(db, config, new Date("2026-08-23T00:00:00Z"));
  const slot = listAvailableSlots(db)[0];
  const bookingId = createBooking(db, { slotId: slot.id, clientName: "Тест", contact: "test@example.com", contactType: "email" }, "public-code-2");
  decideBooking(db, bookingId, "rejected");
  assert.equal(listAvailableSlots(db).some((item) => item.id === slot.id), true);
});

test("manager controls specialists and only available slots can be deleted", () => {
  const db = openDatabase(join(mkdtempSync(join(tmpdir(), "psy-v2-")), "test.sqlite"));
  seedSchedule(db, config, new Date("2026-08-23T00:00:00Z"));
  createSpecialist(db, { id: "two", name: "Второй специалист", description: "Тест" });
  assert.equal(listSpecialists(db).some((item) => item.id === "two" && item.active), true);
  const slotId = createSlot(db, "two", "2027-01-15T10:00:00.000Z");
  assert.equal(listManagedSlots(db).some((item) => item.id === slotId), true);
  deleteAvailableSlot(db, slotId);
  assert.equal(listManagedSlots(db).some((item) => item.id === slotId), false);
  setSpecialistActive(db, "two", false);
  assert.equal(listSpecialists(db).find((item) => item.id === "two").active, false);
});

test("retention removes personal data after 30 days but keeps booking state", () => {
  const db = openDatabase(join(mkdtempSync(join(tmpdir(), "psy-v2-")), "test.sqlite"));
  seedSchedule(db, config, new Date("2026-06-01T00:00:00Z"));
  const slot = listAvailableSlots(db)[0];
  createBooking(db, { slotId: slot.id, clientName: "Тестовый клиент", contact: "test@example.org", contactType: "email" }, "expired-code", "2026-07-01T10:00:00.000Z");
  const changed = purgeExpiredPersonalData(db, new Date("2026-09-02T10:00:00.000Z"));
  assert.equal(changed, 1);
  const booking = db.prepare("SELECT client_name, contact, status FROM bookings WHERE public_code = ?").get("expired-code");
  assert.equal(booking.client_name, "[удалено по сроку хранения]");
  assert.equal(booking.contact, "[удалено по сроку хранения]");
  assert.equal(booking.status, "pending");
});
