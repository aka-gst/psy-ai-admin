import assert from "node:assert/strict";
import test from "node:test";
import { createRetriever } from "./retrieval.mjs";
import { stem, tokenize } from "./text.mjs";

const documents = [
  { sourceKey: "rental", text: "Аренда залов для психологов. Кабинеты, залы, оборудование, проектор, количество мест 25." },
  { sourceKey: "club", text: "Психологический клуб, вечер с пользой, встречи по вторникам, регистрация участников." },
  { sourceKey: "education", text: "Обучение процессуальной психологии, ступени программ, супервизия, документы государственного образца." },
];

test("окончания отсекаются, чтобы вопрос совпал с описанием страницы", () => {
  for (const [left, right] of [["аренда", "арендовать"], ["зал", "зале"], ["проектор", "проектора"], ["ступень", "ступени"]]) {
    assert.equal(stem(left), stem(right), `${left} / ${right}`);
  }
});

test("служебные и вопросительные слова не участвуют в поиске", () => {
  assert.deepEqual(tokenize("Как что где когда"), []);
  assert.ok(tokenize("Есть ли проектор в зале?").includes(stem("проектор")));
});

test("поиск находит страницу по слову, которого нет ни в одном правиле", () => {
  // Порог низкий намеренно: на корпусе из трёх документов вес редкого слова
  // мал, а проверяется здесь ранжирование, а не отсечение.
  const search = createRetriever(documents, { minScore: 0.5 });
  assert.equal(search("Есть ли проектор?").sourceKey, "rental");
  assert.equal(search("Что такое супервизия?").sourceKey, "education");
});

test("посторонний вопрос не получает страницу", () => {
  const search = createRetriever(documents, { minScore: 3 });
  assert.equal(search("Как приготовить борщ?"), null);
  assert.equal(search(""), null);
});

test("порог решает, отвечать или признать незнание", () => {
  const question = "Нужна ли регистрация?";
  assert.ok(createRetriever(documents, { minScore: 0.5 })(question));
  assert.equal(createRetriever(documents, { minScore: 50 })(question), null);
});

test("пустой корпус не ломает поиск", () => {
  assert.equal(createRetriever([], { minScore: 1 })("Аренда зала"), null);
});
