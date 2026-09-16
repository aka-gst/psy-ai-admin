import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createBooking, createInquiry, createSlot, createSpecialist, decideBooking, deleteAvailableSlot, deleteBooking, deleteInquiry, listAvailableSlots, listBookings, listInquiries, listManagedSlots, listSpecialists, openDatabase, purgeExpiredPersonalData, seedDemoData, seedSchedule, setSpecialistActive, updateBooking, updateInquiry } from "../lib/database.mjs";

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

  createInquiry(db, { kind: "callback", clientName: "Тестовый клиент", contact: "+70000000000", contactType: "phone", requestedFor: "", details: "Перезвонить", status: "pending" }, "expired-lead", "2026-07-01T10:00:00.000Z");
  const inquiryChanges = purgeExpiredPersonalData(db, new Date("2026-09-02T10:00:00.000Z"));
  assert.equal(inquiryChanges, 1);
  const inquiry = db.prepare("SELECT client_name, contact, details FROM inquiries WHERE public_code = ?").get("expired-lead");
  assert.equal(inquiry.client_name, "[удалено по сроку хранения]");
  assert.equal(inquiry.contact, "[удалено по сроку хранения]");
  assert.equal(inquiry.details, "[удалено по сроку хранения]");
});

test("demo seeds cover specialist, hall, seminar and incomplete contact flows", () => {
  const db = openDatabase(join(mkdtempSync(join(tmpdir(), "psy-v2-")), "demo.sqlite"));
  seedSchedule(db, config, new Date("2026-09-03T00:00:00Z"));
  seedDemoData(db, new Date("2026-09-03T00:00:00Z"));
  assert.equal(listBookings(db).length, 2);
  const inquiries = listInquiries(db);
  assert.deepEqual(new Set(inquiries.map((item) => item.kind)), new Set(["hall_rental", "seminar", "callback", "email"]));
  assert.equal(inquiries.filter((item) => !item.clientName).length, 2);
  seedDemoData(db, new Date("2026-09-04T00:00:00Z"));
  assert.equal(listBookings(db).length, 2, "повторный запуск не размножает демо-заявки");
});

test("manager edits, moves and removes synthetic requests", () => {
  const db = openDatabase(join(mkdtempSync(join(tmpdir(), "psy-v2-")), "manage.sqlite"));
  seedSchedule(db, config, new Date("2026-09-03T00:00:00Z"));
  const [first, second] = listAvailableSlots(db);
  const bookingId = createBooking(db, { slotId: first.id, clientName: "Тест", contact: "+70000000000", contactType: "phone" }, "editable");
  updateBooking(db, bookingId, { slotId: second.id, clientName: "Обновлён", contact: "edit@example.test", contactType: "email", status: "confirmed" });
  const moved = listBookings(db).find((item) => item.id === bookingId);
  assert.equal(moved.startsAt, second.startsAt);
  assert.equal(moved.status, "confirmed");
  assert.equal(listAvailableSlots(db).some((item) => item.id === first.id), true);
  deleteBooking(db, bookingId);
  assert.equal(listBookings(db).length, 0);

  const inquiryId = createInquiry(db, { kind: "callback", clientName: "", contact: "+70000000000", contactType: "phone", requestedFor: "", details: "Перезвонить", status: "pending" }, "lead");
  updateInquiry(db, inquiryId, { kind: "hall_rental", clientName: "Тест", contact: "lead@example.test", contactType: "email", requestedFor: "10 сентября", details: "Зал", status: "confirmed" });
  assert.equal(listInquiries(db)[0].kind, "hall_rental");
  deleteInquiry(db, inquiryId);
  assert.equal(listInquiries(db).length, 0);
});
