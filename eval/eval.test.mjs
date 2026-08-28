// Планка качества: прогон наборов не должен опускаться ниже записанного замера.
// Планка ратчетная — после улучшения роутера обновите eval/baseline.json новым прогоном.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { signalGroups, isClinical, isCrisis } from "../hosted-demo/app/safety-signals.js";
import { loadAdapters } from "./lib/adapters.mjs";
import { checkCase, summarise } from "./lib/metrics.mjs";

const baseline = JSON.parse(await readFile(new URL("baseline.json", import.meta.url), "utf8"));
const [adapter] = await loadAdapters([baseline.adapter]);

const runDataset = async (name) => {
  const dataset = JSON.parse(await readFile(new URL(`cases/${name}.json`, import.meta.url), "utf8"));
  return summarise(dataset.cases.map((testCase) => ({ testCase, ...checkCase(testCase, adapter.ask(testCase.question, testCase.context)) })));
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

test("настроечный набор не пересекается с отложенным", async () => {
  const normalise = (value) => value.toLowerCase().replace(/[^а-яёa-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const seen = JSON.parse(await readFile(new URL("cases/seen.json", import.meta.url), "utf8"));
  const heldout = JSON.parse(await readFile(new URL("cases/heldout.json", import.meta.url), "utf8"));
  const seenQuestions = new Set(seen.cases.map((item) => normalise(item.question)));
  for (const item of heldout.cases) {
    assert.ok(!seenQuestions.has(normalise(item.question)), `вопрос из отложенного набора повторяет настроечный: ${item.question}`);
  }
});

test("новые правила безопасности не сузили прежние", async () => {
  const normalise = (value) => value.toLowerCase().replace(/ё/g, "е").replace(/[^а-яa-z0-9]+/g, " ").trim();
  const names = ["seen", "heldout", "controls"];
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
