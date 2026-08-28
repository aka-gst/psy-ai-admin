import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "psy-v2-auth-")), "auth.sqlite");
process.env.ADMIN_PASSWORD = "правильный-длинный-пароль-для-теста";
process.env.SESSION_SECRET = "другой-длинный-секрет-для-подписи-сессии";
const { server } = await import("../server.mjs");

let origin = "";
before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const login = (password, headers = {}) => fetch(`${origin}/api/admin/login`, {
  method: "POST",
  headers: { "content-type": "application/json", origin, ...headers },
  body: JSON.stringify({ password }),
});

test("запрос без заголовка Origin в панель не проходит", async () => {
  const response = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
  });
  assert.equal(response.status, 403);
});

test("чужой Origin в панель не проходит", async () => {
  assert.equal((await login(process.env.ADMIN_PASSWORD, { origin: "https://evil.example" })).status, 403);
});

test("кука сессии закрыта от скриптов и от чужого сайта", async () => {
  const response = await login(process.env.ADMIN_PASSWORD);
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  // Соединение в тесте без TLS, поэтому Secure не ставится и вход остаётся
  // возможным локально; за прокси признаком служит x-forwarded-proto.
  assert.doesNotMatch(cookie, /Secure/);
  const secured = await login(process.env.ADMIN_PASSWORD, { "x-forwarded-proto": "https" });
  assert.match(secured.headers.get("set-cookie"), /Secure/);
});

test("перебор пароля упирается в блокировку, а не идёт бесконечно", async () => {
  const statuses = [];
  for (let attempt = 0; attempt < 7; attempt += 1) statuses.push((await login("неверный")).status);
  assert.ok(statuses.includes(401), "первые попытки отвергаются как неверный пароль");
  assert.ok(statuses.includes(429), `после серии неудач должна наступать блокировка: ${statuses.join(",")}`);
  const blocked = await login(process.env.ADMIN_PASSWORD);
  assert.equal(blocked.status, 429, "верный пароль во время блокировки тоже ждёт");
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});
