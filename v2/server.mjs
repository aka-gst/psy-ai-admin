import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBooking, createSlot, createSpecialist, decideBooking, deleteAvailableSlot, listAvailableSlots, listBookings, listManagedSlots, listSpecialists, openDatabase, seedSchedule, setSpecialistActive } from "./lib/database.mjs";
import { createSession, readCookie, sameOrigin, verifySession } from "./lib/security.mjs";
import { createAssistant, createCrisisClassifier } from "../engine/index.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const config = JSON.parse(await readFile(join(root, "config/center.json"), "utf8"));
const db = openDatabase(process.env.DATABASE_PATH || join(root, "data/booking.sqlite"));
seedSchedule(db, config);

// Тот же движок, что и у публичной витрины: границы безопасности общие,
// различается только каталог арендатора.
//
// Второй рубеж распознавания кризиса включается, когда задан адрес локальной
// модели. Он выключен по умолчанию: продукт не должен молча зависеть от
// сервиса, который может быть не поднят. Без него распознавание работает на
// списках шаблонов, а они, по замерам, не обобщаются — см.
// docs/crisis-detection-limits.md.
const crisisClassifier = process.env.OLLAMA_BASE_URL
  ? createCrisisClassifier({ baseUrl: process.env.OLLAMA_BASE_URL, model: process.env.CHAT_MODEL || "qwen3:8b" })
  : null;
const assistant = createAssistant(JSON.parse(await readFile(join(root, "config/assistant.json"), "utf8")), { crisisClassifier });

const json = (response, status, body, headers = {}) => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  response.end(JSON.stringify(body));
};

const parseBody = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error("body_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};

const clean = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
const isAdmin = (request) => verifySession(readCookie(request, "psy_admin_session"), process.env.SESSION_SECRET || "");

async function serveStatic(pathname, response) {
  const routes = { "/": "index.html", "/admin": "admin.html" };
  const relative = routes[pathname] || pathname.replace(/^\//, "");
  if (!/^[a-zA-Z0-9._/-]+$/.test(relative) || relative.includes("..")) return false;
  try {
    const file = await readFile(join(root, "public", relative));
    const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" }[extname(relative)] || "application/octet-stream";
    response.writeHead(200, { "content-type": mime, "x-content-type-options": "nosniff" });
    response.end(file);
    return true;
  } catch {
    return false;
  }
}

export const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/config") return json(response, 200, { centerName: config.centerName, bookingNotice: config.bookingNotice, consentText: config.consentText });
    if (request.method === "GET" && url.pathname === "/api/slots") return json(response, 200, { slots: listAvailableSlots(db) });
    if (request.method === "POST" && url.pathname === "/api/ask") {
      // Вопрос нигде не сохраняется: ни в базе, ни в журнале сервера.
      const body = await parseBody(request);
      const question = clean(body.question, 500);
      if (!question) return json(response, 400, { error: "Напишите вопрос." });
      const answer = await assistant.ask(question, clean(body.lastSourceKey, 40) || undefined);
      return json(response, 200, { text: answer.text, kind: answer.kind, sourceKeys: answer.sourceKeys, sources: answer.sourceKeys.map((key) => assistant.sources[key]) });
    }
    if (request.method === "POST" && url.pathname === "/api/bookings") {
      const body = await parseBody(request);
      const input = { slotId: Number(body.slotId), clientName: clean(body.clientName, 80), contact: clean(body.contact, 160), contactType: body.contactType };
      if (!input.slotId || input.clientName.length < 2 || !["phone", "email"].includes(input.contactType) || input.contact.length < 5 || body.consent !== true) {
        return json(response, 400, { error: "Проверьте слот, имя, контакт и согласие." });
      }
      const publicCode = randomBytes(6).toString("hex");
      createBooking(db, input, publicCode);
      return json(response, 201, { publicCode, status: "pending", message: config.bookingNotice });
    }
    if (request.method === "POST" && url.pathname === "/api/admin/login") {
      if (!sameOrigin(request)) return json(response, 403, { error: "Недопустимый источник запроса." });
      if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) return json(response, 503, { error: "Панель менеджера ещё не настроена." });
      const body = await parseBody(request);
      if (body.password !== process.env.ADMIN_PASSWORD) return json(response, 401, { error: "Неверный пароль." });
      const token = createSession(process.env.SESSION_SECRET || "");
      return json(response, 200, { ok: true }, { "set-cookie": `psy_admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` });
    }
    if (request.method === "GET" && url.pathname === "/api/admin/bookings") {
      if (!isAdmin(request)) return json(response, 401, { error: "Требуется вход." });
      return json(response, 200, { bookings: listBookings(db) });
    }
    if (request.method === "GET" && url.pathname === "/api/admin/schedule") {
      if (!isAdmin(request)) return json(response, 401, { error: "Требуется вход." });
      return json(response, 200, { specialists: listSpecialists(db), slots: listManagedSlots(db) });
    }
    if (request.method === "POST" && url.pathname === "/api/admin/specialists") {
      if (!isAdmin(request) || !sameOrigin(request)) return json(response, 401, { error: "Требуется вход." });
      const body = await parseBody(request);
      const name = clean(body.name, 80);
      const description = clean(body.description, 160);
      if (name.length < 2) return json(response, 400, { error: "Укажите имя специалиста." });
      const id = `specialist-${randomBytes(5).toString("hex")}`;
      createSpecialist(db, { id, name, description });
      return json(response, 201, { id });
    }
    const specialistMatch = url.pathname.match(/^\/api\/admin\/specialists\/([a-zA-Z0-9-]+)$/);
    if (request.method === "POST" && specialistMatch) {
      if (!isAdmin(request) || !sameOrigin(request)) return json(response, 401, { error: "Требуется вход." });
      const body = await parseBody(request);
      if (typeof body.active !== "boolean") return json(response, 400, { error: "Некорректный статус." });
      setSpecialistActive(db, specialistMatch[1], body.active);
      return json(response, 200, { ok: true });
    }
    if (request.method === "POST" && url.pathname === "/api/admin/slots") {
      if (!isAdmin(request) || !sameOrigin(request)) return json(response, 401, { error: "Требуется вход." });
      const body = await parseBody(request);
      const startsAt = clean(body.startsAt, 40);
      const specialistId = clean(body.specialistId, 80);
      const parsedStart = Date.parse(startsAt);
      if (!specialistId || !Number.isFinite(parsedStart) || parsedStart <= Date.now()) return json(response, 400, { error: "Выберите специалиста и будущее время." });
      const id = createSlot(db, specialistId, new Date(parsedStart).toISOString());
      return json(response, 201, { id });
    }
    const slotMatch = url.pathname.match(/^\/api\/admin\/slots\/(\d+)$/);
    if (request.method === "DELETE" && slotMatch) {
      if (!isAdmin(request) || !sameOrigin(request)) return json(response, 401, { error: "Требуется вход." });
      deleteAvailableSlot(db, Number(slotMatch[1]));
      return json(response, 200, { ok: true });
    }
    const decisionMatch = url.pathname.match(/^\/api\/admin\/bookings\/(\d+)$/);
    if (request.method === "POST" && decisionMatch) {
      if (!isAdmin(request) || !sameOrigin(request)) return json(response, 401, { error: "Требуется вход." });
      const body = await parseBody(request);
      decideBooking(db, Number(decisionMatch[1]), body.decision);
      return json(response, 200, { ok: true, notification: "queued" });
    }
    if (request.method === "GET" && await serveStatic(url.pathname, response)) return;
    json(response, 404, { error: "Не найдено." });
  } catch (error) {
    const known = ["slot_unavailable", "booking_not_pending", "invalid_decision", "specialist_not_found", "specialist_inactive", "slot_not_deletable"];
    json(response, known.includes(error.message) ? 409 : 500, { error: known.includes(error.message) ? "Состояние записи уже изменилось." : "Внутренняя ошибка." });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4180);
  const host = process.env.HOST || "127.0.0.1";
  server.listen(port, host, () => console.log(`Psy AI Admin V2: http://${host}:${port}\nРаспознавание кризиса: ${crisisClassifier ? `шаблоны + модель ${process.env.CHAT_MODEL || "qwen3:8b"}` : "только шаблоны (OLLAMA_BASE_URL не задан)"}`));
}
