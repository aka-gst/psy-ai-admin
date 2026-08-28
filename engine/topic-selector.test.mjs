import assert from "node:assert/strict";
import test from "node:test";
import { createTopicSelector } from "./topic-selector.mjs";

const topics = [
  { key: "schedule", hint: "расписание, даты, регистрация" },
  { key: "rental", hint: "аренда залов, оборудование" },
  { key: "programs", hint: "все программы центра" },
];
const answering = (text, log) => async (messages, options) => { log?.push({ messages, options }); return text; };

test("модель называет раздел, и он возвращается как есть", async () => {
  assert.equal(await createTopicSelector({ topics, ask: answering("rental") })("Есть ли проектор?"), "rental");
});

test("отказ модели и отсутствие подходящего раздела дают один и тот же null", async () => {
  assert.equal(await createTopicSelector({ topics, ask: answering("НЕТ") })("Как приготовить борщ?"), null);
  assert.equal(await createTopicSelector({ topics, ask: answering(null) })("Что-нибудь"), null);
});

test("непонятный ответ не превращается в выбор наугад", async () => {
  assert.equal(await createTopicSelector({ topics, ask: answering("возможно расписание или аренда") })("вопрос"), null);
  assert.equal(await createTopicSelector({ topics, ask: answering("выдуманный-раздел") })("вопрос"), null);
});

test("код раздела ищется по границе слова, а не по вхождению", async () => {
  // «programs» содержит «program»: подстрочное совпадение выбрало бы не тот раздел.
  assert.equal(await createTopicSelector({ topics, ask: answering("programs") })("вопрос"), "programs");
});

test("список разделов и вопрос попадают в запрос", async () => {
  const log = [];
  await createTopicSelector({ topics, ask: answering("schedule", log) })("Когда ближайшее занятие?");
  const content = log[0].messages[0].content;
  assert.match(content, /schedule: расписание/);
  assert.match(content, /Когда ближайшее занятие\?/);
});

test("повторный вопрос не спрашивается заново", async () => {
  const log = [];
  const select = createTopicSelector({ topics, ask: answering("rental", log) });
  await select("Аренда зала");
  await select("аренда зала ");
  assert.equal(log.length, 1);
});
