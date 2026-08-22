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

export function listBookings(db) {
  return db.prepare(`
    SELECT bookings.id, bookings.public_code AS publicCode, bookings.client_name AS clientName,
      bookings.contact, bookings.contact_type AS contactType, bookings.status,
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
