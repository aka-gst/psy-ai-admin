import assert from "node:assert/strict";
import test from "node:test";
import { contextForSource, createComposer, inventedNumbers } from "./composer.mjs";

const context = "Аренда залов. Зал 45 квадратных метров, количество мест 25.";
const answering = (text) => async () => text;

test("число, которого нет в материале, считается выдуманным", () => {
  assert.deepEqual(inventedNumbers("Стоит 700 рублей в час", context), ["700"]);
  assert.deepEqual(inventedNumbers("Зал на 25 человек, 45 метров", context), []);
});

test("ответ с выдуманной ценой отвергается, а не показывается", async () => {
  const compose = createComposer({ ask: answering("Аренда стоит 1200 рублей в час, зал на 25 мест.") });
  assert.equal(await compose({ question: "Сколько стоит?", context }), null);
});

test("ответ, опирающийся на материал, проходит", async () => {
  const compose = createComposer({ ask: answering("В зале 45 квадратных метров и 25 мест. Подробности на странице аренды.") });
  const answer = await compose({ question: "Какой зал?", context });
  assert.match(answer, /45/);
});

test("молчание, обрывок и простыня рассуждений не выдаются за ответ", async () => {
  assert.equal(await createComposer({ ask: answering(null) })({ question: "?", context }), null);
  assert.equal(await createComposer({ ask: answering("Да.") })({ question: "?", context }), null);
  assert.equal(await createComposer({ ask: answering("а".repeat(900)) })({ question: "?", context }), null);
});

test("без модели сочинения не происходит вовсе", async () => {
  assert.equal(await createComposer({})({ question: "?", context }), null);
});

test("ответ обрезается до трёх фраз", async () => {
  const compose = createComposer({ ask: answering("Первая фраза. Вторая фраза. Третья фраза. Четвёртая фраза.") });
  assert.equal((await compose({ question: "?", context })).includes("Четвёртая"), false);
});

test("материал для ответа берётся из каталога и включает только подтверждённый FAQ", () => {
  const catalog = {
    sources: { rental: { label: "Аренда", description: "Залы", about: "оборудование", response: "rental" } },
    responses: { rental: "Цены на странице аренды." },
    faq: [
      { source: "rental", confirmed: true, text: "Вместимость 25 мест." },
      { source: "rental", confirmed: false, text: "Скидка 30 процентов." },
    ],
  };
  const context = contextForSource(catalog, "rental");
  assert.match(context, /Вместимость 25 мест/);
  assert.doesNotMatch(context, /Скидка/);
  assert.equal(contextForSource(catalog, "нет-такого"), "");
});
