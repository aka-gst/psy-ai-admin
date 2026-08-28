import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "psy-v2-ask-")), "ask.sqlite");
const { server } = await import("../server.mjs");
const { listBookings, openDatabase } = await import("../lib/database.mjs");

let origin = "";
before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const ask = async (question) => {
  const response = await fetch(`${origin}/api/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
  return { status: response.status, body: await response.json() };
};

test("кризисное сообщение получает экстренный ответ без навигации", async () => {
  for (const message of ["Я больше не могу так жить", "Мой друг говорит, что хочет умереть", "Я боюсь, что наврежу себе"]) {
    const { body } = await ask(message);
    assert.equal(body.kind, "crisis", message);
    assert.match(body.text, /112|экстренн/i);
    assert.deepEqual(body.sources, []);
  }
});

test("медицинские и платёжные вопросы упираются в границу и ведут к форме записи", async () => {
  for (const message of ["Посоветуйте антидепрессант", "Как справиться с паникой ночью?", "Скину номер карты в чат"]) {
    const { body } = await ask(message);
    assert.equal(body.kind, "boundary", message);
    assert.equal(body.sources[0].url, "/");
  }
});

test("организационный вопрос ведёт к форме, незнакомый — признаётся незнакомым", async () => {
  assert.equal((await ask("Какое есть свободное время?")).body.kind, "route");
  assert.equal((await ask("Какая завтра погода?")).body.kind, "unknown");
});

test("пустой вопрос отклоняется", async () => {
  const { status, body } = await ask("   ");
  assert.equal(status, 400);
  assert.ok(body.error);
});

test("вопросы не попадают в базу заявок", async () => {
  await ask("Меня зовут Тест, мой телефон +70000000000, запишите меня");
  const db = openDatabase(process.env.DATABASE_PATH);
  assert.deepEqual(listBookings(db), []);
});
