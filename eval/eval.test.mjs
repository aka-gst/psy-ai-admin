// Планка качества: прогон наборов не должен опускаться ниже записанного замера.
// Планка ратчетная — после улучшения роутера обновите eval/baseline.json новым прогоном.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createAssistant, signalGroups, isClinical, isCrisis } from "../engine/index.mjs";
import { loadAdapters } from "./lib/adapters.mjs";
import { checkCase, summarise } from "./lib/metrics.mjs";

const baseline = JSON.parse(await readFile(new URL("baseline.json", import.meta.url), "utf8"));

// Наборы перечисляются по каталогу: добавленный файл сразу попадает во все
// проверки, а не только в те, где его вписали руками.
const datasetNames = async () => (await readdir(new URL("cases/", import.meta.url))).filter((file) => file.endsWith(".json")).map((file) => file.replace(/\.json$/, "")).sort();
const [adapter] = await loadAdapters([baseline.adapter]);

const runDataset = async (name) => {
  const dataset = JSON.parse(await readFile(new URL(`cases/${name}.json`, import.meta.url), "utf8"));
  const results = [];
  for (const testCase of dataset.cases) results.push({ testCase, ...checkCase(testCase, await adapter.ask(testCase.question, testCase.context)) });
  return summarise(results);
};

for (const [name, recorded] of Object.entries(baseline.datasets)) {
  test(`набор ${name}: качество не ниже записанного замера`, async () => {
    const summary = await runDataset(name);
    assert.equal(summary.total, recorded.total, "изменился размер набора — перезапишите baseline.json");
    assert.ok(summary.passed >= recorded.passed, `верных маршрутов ${summary.passed}, было ${recorded.passed}`);
    assert.ok(summary.criticalPassed >= recorded.criticalPassed, `критичных кейсов пройдено ${summary.criticalPassed}, было ${recorded.criticalPassed}`);
    assert.ok(summary.confidentlyWrong <= recorded.confidentlyWrong, `уверенно неверных маршрутов ${summary.confidentlyWrong}, было ${recorded.confidentlyWrong}`);
  });
}

test("наборы не пересекаются между собой", async () => {
  const normalise = (value) => value.toLowerCase().replace(/[^а-яёa-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const seenQuestions = new Map();
  for (const name of await datasetNames()) {
    const dataset = JSON.parse(await readFile(new URL(`cases/${name}.json`, import.meta.url), "utf8"));
    for (const item of dataset.cases) {
      const key = normalise(item.question);
      const owner = seenQuestions.get(key);
      assert.ok(!owner, `вопрос встречается в наборах ${owner} и ${name}: ${item.question}`);
      seenQuestions.set(key, name);
    }
  }
});

test("новые правила безопасности не сузили прежние", async () => {
  const normalise = (value) => value.toLowerCase().replace(/ё/g, "е").replace(/[^а-яa-z0-9]+/g, " ").trim();
  const names = await datasetNames();
  const questions = [];
  for (const name of names) {
    const dataset = JSON.parse(await readFile(new URL(`cases/${name}.json`, import.meta.url), "utf8"));
    questions.push(...dataset.cases.map((item) => item.question));
  }
  for (const question of questions) {
    const text = normalise(question);
    if (signalGroups.LEGACY_CRISIS.test(text)) assert.ok(isCrisis(question), `перестал распознаваться как кризис: ${question}`);
    if (signalGroups.LEGACY_CLINICAL.test(text)) assert.ok(isClinical(question), `перестал распознаваться как клиника: ${question}`);
  }
});

// Границы безопасности принадлежат движку, а не каталогу, поэтому они обязаны
// вести себя одинаково у любого арендатора. Страницы у арендаторов разные,
// поэтому проверяется тип ответа, а не то, куда он ведёт.
test("границы безопасности одинаковы для всех арендаторов", async () => {
  const tenants = [];
  for (const [name, path] of [["витрина", "../hosted-demo/app/center-content.json"], ["v2", "../v2/config/assistant.json"]]) {
    tenants.push([name, createAssistant(JSON.parse(await readFile(new URL(path, import.meta.url), "utf8")))]);
  }
  const expected = { "Кризис": "crisis", "Клиника": "boundary", "Платёжные данные": "boundary" };
  const forbidden = { "Контроль кризиса": "crisis", "Контроль клиники": "boundary" };
  for (const name of ["heldout", "controls"]) {
    const dataset = JSON.parse(await readFile(new URL(`cases/${name}.json`, import.meta.url), "utf8"));
    for (const item of dataset.cases) {
      for (const [tenant, assistant] of tenants) {
        const kind = (await assistant.ask(item.question)).kind;
        if (expected[item.category]) assert.equal(kind, expected[item.category], `${tenant}: ${item.question}`);
        if (forbidden[item.category]) assert.notEqual(kind, forbidden[item.category], `${tenant}: ложное срабатывание — ${item.question}`);
      }
    }
  }
});
