import assert from "node:assert/strict";
import test from "node:test";
import { createCrisisClassifier } from "./crisis-classifier.mjs";

const reply = (text) => ({ ok: true, json: async () => ({ response: text }) });
const stub = (text, log) => async (url, init) => {
  log?.push({ url, body: JSON.parse(init.body) });
  return reply(text);
};

test("вердикт модели читается независимо от регистра и лишних слов", async () => {
  assert.equal(await createCrisisClassifier({ request: stub("РИСК") })("тест"), true);
  assert.equal(await createCrisisClassifier({ request: stub(" обычное.\n") })("тест"), false);
});

test("непонятный ответ модели не выдаётся за «обычное сообщение»", async () => {
  assert.equal(await createCrisisClassifier({ request: stub("возможно, стоит уточнить") })("тест"), null);
});

test("недоступная или сбойная модель возвращает «не удалось спросить»", async () => {
  const failing = createCrisisClassifier({ request: async () => { throw new Error("ECONNREFUSED"); } });
  assert.equal(await failing("тест"), null);
  const rejected = createCrisisClassifier({ request: async () => ({ ok: false, json: async () => ({}) }) });
  assert.equal(await rejected("тест"), null);
});

test("медленная модель обрывается по таймауту, а не подвешивает ответ", async () => {
  const slow = createCrisisClassifier({
    timeoutMs: 20,
    request: (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    }),
  });
  assert.equal(await slow("тест"), null);
});

test("повторный вопрос не спрашивается у модели заново", async () => {
  const log = [];
  const classify = createCrisisClassifier({ request: stub("РИСК", log) });
  await classify("Мне очень плохо");
  await classify("мне очень плохо  ");
  assert.equal(log.length, 1);
});

test("неудачный ответ не кэшируется: следующая попытка спрашивает снова", async () => {
  let answer = "непонятно";
  const log = [];
  const classify = createCrisisClassifier({ request: async (url, init) => { log.push(init); return reply(answer); } });
  assert.equal(await classify("тест"), null);
  answer = "РИСК";
  assert.equal(await classify("тест"), true);
  assert.equal(log.length, 2);
});

test("пустое сообщение не отправляется модели", async () => {
  const log = [];
  assert.equal(await createCrisisClassifier({ request: stub("РИСК", log) })("   "), false);
  assert.equal(log.length, 0);
});

test("в запросе идут модель, нулевая температура и выключенные рассуждения", async () => {
  const log = [];
  await createCrisisClassifier({ model: "qwen3:8b", request: stub("ОБЫЧНОЕ", log) })("Сколько стоит аренда?");
  assert.equal(log[0].body.model, "qwen3:8b");
  assert.equal(log[0].body.think, false);
  assert.equal(log[0].body.options.temperature, 0);
  assert.match(log[0].body.prompt, /Сколько стоит аренда\?\nОтвет:$/);
});
