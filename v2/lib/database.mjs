import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDatabase(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS specialists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      specialist_id TEXT NOT NULL REFERENCES specialists(id),
      starts_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','held','booked')),
      UNIQUE(specialist_id, starts_at)
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_code TEXT NOT NULL UNIQUE,
      slot_id INTEGER NOT NULL REFERENCES slots(id),
      client_name TEXT NOT NULL,
      contact TEXT NOT NULL,
      contact_type TEXT NOT NULL CHECK(contact_type IN ('phone','email')),
      consented_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected')),
      created_at TEXT NOT NULL,
      decided_at TEXT
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL REFERENCES bookings(id),
      event TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sent','failed')),
      created_at TEXT NOT NULL,
      sent_at TEXT
    );
    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_code TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK(kind IN ('hall_rental','seminar','callback','email')),
      client_name TEXT NOT NULL DEFAULT '',
      contact TEXT NOT NULL,
      contact_type TEXT NOT NULL CHECK(contact_type IN ('phone','email')),
      requested_for TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

export function seedSchedule(db, config, now = new Date()) {
  const addSpecialist = db.prepare("INSERT OR IGNORE INTO specialists (id,name,description) VALUES (?,?,?)");
  for (const item of config.specialists) addSpecialist.run(item.id, item.name, item.description);

  const addSlot = db.prepare("INSERT OR IGNORE INTO slots (specialist_id,starts_at) VALUES (?,?)");
  for (let offset = 1; offset <= 14; offset += 1) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() + offset);
    const day = date.getUTCDay();
    if (day === 0 || day === 6) continue;
    const datePart = date.toISOString().slice(0, 10);
    for (const specialist of config.specialists) {
      for (const hour of config.slotHours) addSlot.run(specialist.id, `${datePart}T${hour}:00+03:00`);
    }
  }
}

export function listAvailableSlots(db) {
  return db.prepare(`
    SELECT slots.id, slots.starts_at AS startsAt, specialists.name AS specialistName,
           specialists.description AS specialistDescription
    FROM slots JOIN specialists ON specialists.id = slots.specialist_id
    WHERE slots.status = 'available' AND specialists.active = 1
    ORDER BY slots.starts_at, specialists.name
  `).all();
}

export function listSpecialists(db) {
  return db.prepare(`
    SELECT id, name, description, active
    FROM specialists
    ORDER BY active DESC, name
  `).all().map((item) => ({ ...item, active: Boolean(item.active) }));
}

export function createSpecialist(db, input) {
  db.prepare("INSERT INTO specialists (id,name,description) VALUES (?,?,?)")
    .run(input.id, input.name, input.description);
}

export function setSpecialistActive(db, specialistId, active) {
  const result = db.prepare("UPDATE specialists SET active = ? WHERE id = ?").run(active ? 1 : 0, specialistId);
  if (result.changes !== 1) throw new Error("specialist_not_found");
}

export function listManagedSlots(db) {
  return db.prepare(`
    SELECT slots.id, slots.starts_at AS startsAt, slots.status,
      specialists.id AS specialistId, specialists.name AS specialistName
    FROM slots JOIN specialists ON specialists.id = slots.specialist_id
    WHERE slots.starts_at >= ?
    ORDER BY slots.starts_at, specialists.name
  `).all(new Date().toISOString().slice(0, 10));
}

export function createSlot(db, specialistId, startsAt) {
  const specialist = db.prepare("SELECT active FROM specialists WHERE id = ?").get(specialistId);
  if (!specialist) throw new Error("specialist_not_found");
  if (!specialist.active) throw new Error("specialist_inactive");
  const result = db.prepare("INSERT INTO slots (specialist_id,starts_at) VALUES (?,?)").run(specialistId, startsAt);
  return Number(result.lastInsertRowid);
}

export function deleteAvailableSlot(db, slotId) {
  const result = db.prepare("DELETE FROM slots WHERE id = ? AND status = 'available'").run(slotId);
  if (result.changes !== 1) throw new Error("slot_not_deletable");
}

export function createBooking(db, input, publicCode, now = new Date().toISOString()) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const slot = db.prepare("SELECT status FROM slots WHERE id = ?").get(input.slotId);
    if (!slot || slot.status !== "available") throw new Error("slot_unavailable");
    db.prepare("UPDATE slots SET status = 'held' WHERE id = ?").run(input.slotId);
    const result = db.prepare(`
      INSERT INTO bookings (public_code,slot_id,client_name,contact,contact_type,consented_at,created_at)
      VALUES (?,?,?,?,?,?,?)
    `).run(publicCode, input.slotId, input.clientName, input.contact, input.contactType, now, now);
    db.exec("COMMIT");
    return Number(result.lastInsertRowid);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Remove names and contacts after the agreed retention period while preserving
 * non-personal schedule state. Safe to run on every process start. */
export function purgeExpiredPersonalData(db, now = new Date(), retentionDays = 30) {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const bookings = db.prepare(`
    UPDATE bookings
    SET client_name = '[удалено по сроку хранения]',
        contact = '[удалено по сроку хранения]'
    WHERE created_at < ?
      AND (client_name != '[удалено по сроку хранения]' OR contact != '[удалено по сроку хранения]')
  `).run(cutoff);
  const inquiries = db.prepare(`
    UPDATE inquiries
    SET client_name = '[удалено по сроку хранения]',
        contact = '[удалено по сроку хранения]',
        details = '[удалено по сроку хранения]'
    WHERE created_at < ?
      AND (client_name != '[удалено по сроку хранения]' OR contact != '[удалено по сроку хранения]' OR details != '[удалено по сроку хранения]')
  `).run(cutoff);
  return Number(bookings.changes) + Number(inquiries.changes);
}

export function listBookings(db) {
  return db.prepare(`
    SELECT bookings.id, bookings.public_code AS publicCode, bookings.client_name AS clientName,
      bookings.contact, bookings.contact_type AS contactType, bookings.slot_id AS slotId, bookings.status,
      bookings.created_at AS createdAt, slots.starts_at AS startsAt,
      specialists.name AS specialistName
    FROM bookings
    JOIN slots ON slots.id = bookings.slot_id
    JOIN specialists ON specialists.id = slots.specialist_id
    ORDER BY bookings.created_at DESC
  `).all();
}

export function decideBooking(db, bookingId, decision, now = new Date().toISOString()) {
  if (!['confirmed', 'rejected'].includes(decision)) throw new Error("invalid_decision");
  db.exec("BEGIN IMMEDIATE");
  try {
    const booking = db.prepare("SELECT id,slot_id AS slotId,status FROM bookings WHERE id = ?").get(bookingId);
    if (!booking || booking.status !== "pending") throw new Error("booking_not_pending");
    db.prepare("UPDATE bookings SET status = ?, decided_at = ? WHERE id = ?").run(decision, now, bookingId);
    db.prepare("UPDATE slots SET status = ? WHERE id = ?").run(decision === "confirmed" ? "booked" : "available", booking.slotId);
    db.prepare("INSERT INTO notifications (booking_id,event,created_at) VALUES (?,?,?)").run(bookingId, decision, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function updateBooking(db, bookingId, input, now = new Date().toISOString()) {
  const allowed = ['pending', 'confirmed', 'rejected'];
  if (!allowed.includes(input.status)) throw new Error('invalid_decision');
  db.exec('BEGIN IMMEDIATE');
  try {
    const booking = db.prepare('SELECT id,slot_id AS slotId FROM bookings WHERE id = ?').get(bookingId);
    if (!booking) throw new Error('booking_not_found');
    const nextSlotId = Number(input.slotId) || booking.slotId;
    const nextSlot = db.prepare('SELECT status FROM slots WHERE id = ?').get(nextSlotId);
    if (!nextSlot || (nextSlotId !== booking.slotId && nextSlot.status !== 'available')) throw new Error('slot_unavailable');
    const nextSlotStatus = input.status === 'confirmed' ? 'booked' : input.status === 'pending' ? 'held' : 'available';
    if (nextSlotId !== booking.slotId) db.prepare("UPDATE slots SET status = 'available' WHERE id = ?").run(booking.slotId);
    db.prepare('UPDATE slots SET status = ? WHERE id = ?').run(nextSlotStatus, nextSlotId);
    db.prepare(`UPDATE bookings SET slot_id = ?, client_name = ?, contact = ?, contact_type = ?, status = ?, decided_at = ?, created_at = created_at WHERE id = ?`)
      .run(nextSlotId, input.clientName, input.contact, input.contactType, input.status, input.status === 'pending' ? null : now, bookingId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function deleteBooking(db, bookingId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const booking = db.prepare('SELECT slot_id AS slotId FROM bookings WHERE id = ?').get(bookingId);
    if (!booking) throw new Error('booking_not_found');
    db.prepare("UPDATE slots SET status = 'available' WHERE id = ?").run(booking.slotId);
    db.prepare('DELETE FROM notifications WHERE booking_id = ?').run(bookingId);
    db.prepare('DELETE FROM bookings WHERE id = ?').run(bookingId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function listInquiries(db) {
  return db.prepare(`SELECT id, public_code AS publicCode, kind, client_name AS clientName,
    contact, contact_type AS contactType, requested_for AS requestedFor, details, status,
    created_at AS createdAt, updated_at AS updatedAt FROM inquiries ORDER BY created_at DESC`).all();
}

export function createInquiry(db, input, publicCode, now = new Date().toISOString()) {
  const result = db.prepare(`INSERT INTO inquiries
    (public_code,kind,client_name,contact,contact_type,requested_for,details,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(publicCode, input.kind, input.clientName, input.contact,
    input.contactType, input.requestedFor, input.details, now, now);
  return Number(result.lastInsertRowid);
}

export function updateInquiry(db, inquiryId, input, now = new Date().toISOString()) {
  const result = db.prepare(`UPDATE inquiries SET kind = ?, client_name = ?, contact = ?,
    contact_type = ?, requested_for = ?, details = ?, status = ?, updated_at = ? WHERE id = ?`)
    .run(input.kind, input.clientName, input.contact, input.contactType, input.requestedFor,
      input.details, input.status, now, inquiryId);
  if (result.changes !== 1) throw new Error('inquiry_not_found');
}

export function deleteInquiry(db, inquiryId) {
  const result = db.prepare('DELETE FROM inquiries WHERE id = ?').run(inquiryId);
  if (result.changes !== 1) throw new Error('inquiry_not_found');
}

export function seedDemoData(db, now = new Date()) {
  if (db.prepare('SELECT count(*) AS count FROM bookings').get().count || db.prepare('SELECT count(*) AS count FROM inquiries').get().count) return;
  const slots = listAvailableSlots(db);
  const make = (index, input, code, status) => {
    const id = createBooking(db, { ...input, slotId: slots[index].id }, code, new Date(now.getTime() - (index + 1) * 3_600_000).toISOString());
    if (status !== 'pending') decideBooking(db, id, status, new Date(now.getTime() - index * 1_800_000).toISOString());
  };
  make(0, { clientName: 'Елена В. · демо', contact: '+7 900 555-10-20', contactType: 'phone' }, 'demo-consultation', 'confirmed');
  make(1, { clientName: 'Алексей П. · демо', contact: 'alexey.demo@example.test', contactType: 'email' }, 'demo-specialist', 'pending');
  const seeds = [
    { code: 'demo-hall', kind: 'hall_rental', clientName: 'Ирина К. · демо', contact: '+7 900 555-20-30', contactType: 'phone', requestedFor: '12 сентября · 18:00–21:00', details: 'Аренда зала для группы из 12 человек', status: 'pending' },
    { code: 'demo-seminar', kind: 'seminar', clientName: 'Марина · демо', contact: 'marina.demo@example.test', contactType: 'email', requestedFor: '18 сентября · 10:00', details: 'Запись на практикум, нужен счёт для организации', status: 'confirmed' },
    { code: 'demo-callback', kind: 'callback', clientName: '', contact: '+7 900 555-30-40', contactType: 'phone', requestedFor: '', details: 'Просит перезвонить, тему пока не уточнила', status: 'pending' },
    { code: 'demo-email', kind: 'email', clientName: '', contact: 'question.demo@example.test', contactType: 'email', requestedFor: '', details: 'Хочет уточнить формат консультации', status: 'pending' },
  ];
  for (const item of seeds) {
    const id = createInquiry(db, item, item.code, new Date(now.getTime() - 8_000_000).toISOString());
    if (item.status !== 'pending') updateInquiry(db, id, item, new Date(now.getTime() - 6_000_000).toISOString());
  }
}
