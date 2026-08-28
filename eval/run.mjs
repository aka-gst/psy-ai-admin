#!/usr/bin/env node
// Прогон наборов проверочных вопросов по всем реализациям роутера.
// Использование: node eval/run.mjs [--only prototype,hosted] [--dataset heldout] [--report путь.md]
import { readFile, readdir, writeFile } from "node:fs/promises";
import { loadAdapters } from "./lib/adapters.mjs";
import { checkCase, summarise } from "./lib/metrics.mjs";

const argv = process.argv.slice(2);
const flag = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
};
const list = (name) => flag(name)?.split(",").map((value) => value.trim()).filter(Boolean);

const casesDir = new URL("cases/", import.meta.url);
const wantedDatasets = list("dataset");
const datasetFiles = (await readdir(casesDir)).filter((file) => file.endsWith(".json"));
const datasets = [];
for (const file of datasetFiles) {
  const dataset = JSON.parse(await readFile(new URL(file, casesDir), "utf8"));
  if (!wantedDatasets || wantedDatasets.includes(dataset.name)) datasets.push(dataset);
}
datasets.sort((a, b) => a.name.localeCompare(b.name));

const adapters = await loadAdapters(list("only"));

const runs = [];
for (const adapter of adapters) {
  for (const dataset of datasets) {
    const results = [];
    for (const testCase of dataset.cases) results.push({ testCase, ...checkCase(testCase, await adapter.ask(testCase.question, testCase.context)) });
    runs.push({ adapter: { id: adapter.id, title: adapter.title, note: adapter.note }, dataset: { name: dataset.name, role: dataset.role ?? "regression", burned: dataset.burned ?? null, title: dataset.title, purpose: dataset.purpose }, summary: summarise(results), results });
  }
}

const pct = (value) => `${value.toFixed(1)}%`.replace(".0%", "%");

// Набор, чьи промахи уже привели к правке, перестаёт быть независимым: качество
// на нём завышено. Заголовок берётся только из действующего отложенного набора.
const roleLabel = (dataset) => dataset.burned
  ? `регрессия · независимость утрачена ${dataset.burned.on}`
  : { heldout: "НЕЗАВИСИМЫЙ ЗАМЕР", regression: "регрессия", controls: "контроль ложных срабатываний", tuning: "подбор параметров" }[dataset.role] ?? dataset.role;

for (const run of runs) {
  const { summary } = run;
  console.log(`\n${run.adapter.title} · набор ${run.dataset.name} — ${roleLabel(run.dataset)}`);
  console.log(`  маршрут верный      ${summary.passed}/${summary.total} (${pct(summary.accuracy)})`);
  console.log(`  критичные кейсы     ${summary.criticalTotal ? `${summary.criticalPassed}/${summary.criticalTotal} (${pct(summary.safetyRecall)})` : "нет в наборе"}`);
  console.log(`  уверенно не туда    ${summary.confidentlyWrong} (${pct(summary.confidentlyWrongRate)})`);
  console.log(`  признал незнание    ${summary.abstained} (${pct(summary.abstentionRate)})`);
  console.log(`  решение принято     ${Object.entries(summary.byVia).map(([via, count]) => `${via}: ${count}`).join(", ")}`);
}

const headline = runs.filter((run) => run.dataset.role === "heldout" && !run.dataset.burned);
if (headline.length) {
  console.log("\nНезависимый замер качества:");
  for (const run of headline) {
    console.log(`  ${run.dataset.name}: маршрут ${run.summary.passed}/${run.summary.total} (${pct(run.summary.accuracy)}), критичные ${run.summary.criticalPassed}/${run.summary.criticalTotal}`);
  }
} else {
  console.log("\nНезависимого набора нет: все отложенные наборы уже использованы для правок. Нужен новый.");
}

const failedCritical = runs.flatMap((run) =>
  run.results.filter((item) => item.testCase.severity === "critical" && !item.pass).map((item) => ({ adapter: run.adapter.id, dataset: run.dataset.name, ...item })));

if (failedCritical.length) {
  console.log(`\nПровалы критичных кейсов: ${failedCritical.length}`);
  for (const item of failedCritical.slice(0, 12)) {
    const failure = item.checks.find((check) => !check.ok);
    console.log(`  [${item.adapter}/${item.dataset}] ${item.testCase.question}`);
    console.log(`      ожидалось ${failure.name}=${failure.want}; получено ${failure.name === "source" || failure.name === "kind" ? failure.got : `«${item.answer.text.slice(0, 70)}…»`}`);
  }
  if (failedCritical.length > 12) console.log(`  … ещё ${failedCritical.length - 12}`);
}

await writeFile(new URL("results/latest.json", import.meta.url), `${JSON.stringify({
  datasets: datasets.map((dataset) => ({ name: dataset.name, cases: dataset.cases.length })),
  runs: runs.map((run) => ({ adapter: run.adapter, dataset: run.dataset.name, summary: run.summary, failures: run.results.filter((item) => !item.pass).map((item) => ({ id: item.testCase.id, category: item.testCase.category, severity: item.testCase.severity, question: item.testCase.question, expect: item.testCase.expect, got: { kind: item.answer.kind, sourceKey: item.answer.sourceKey } })) })),
}, null, 2)}\n`);

const reportPath = flag("report");
if (reportPath) {
  const lines = ["# Замер качества маршрутизации", "", "Отчёт сгенерирован `node eval/run.mjs --report`. Наборы вопросов лежат в `eval/cases/`.", ""];
  for (const dataset of datasets) lines.push(`- **${dataset.name}** (${dataset.cases.length} вопросов) — ${dataset.purpose}`);
  lines.push("", "Реализации в прогоне:", "");
  for (const adapter of adapters) lines.push(`- **${adapter.id}** — ${adapter.title}; ${adapter.note}`);
  lines.push("", "## Итог", "", "| Реализация | Набор | Верный маршрут | Критичные кейсы | Уверенно не туда | Признал незнание |", "|---|---|---:|---:|---:|---:|");
  for (const run of runs) {
    lines.push(`| ${run.adapter.id} | ${run.dataset.name} | ${run.summary.passed}/${run.summary.total} (${pct(run.summary.accuracy)}) | ${run.summary.criticalTotal ? `${run.summary.criticalPassed}/${run.summary.criticalTotal} (${pct(run.summary.safetyRecall)})` : "—"} | ${run.summary.confidentlyWrong} (${pct(run.summary.confidentlyWrongRate)}) | ${run.summary.abstained} (${pct(run.summary.abstentionRate)}) |`);
  }
  for (const run of runs.filter((item) => item.dataset.name !== "seen")) {
    lines.push("", `## ${run.adapter.title} · ${run.dataset.name}: по категориям`, "", "| Категория | Верно | Доля |", "|---|---:|---:|");
    for (const bucket of run.summary.byCategory) lines.push(`| ${bucket.category} | ${bucket.passed}/${bucket.total} | ${pct(bucket.accuracy)} |`);
  }
  const criticalByAdapter = new Map();
  for (const item of failedCritical) criticalByAdapter.set(item.adapter, [...(criticalByAdapter.get(item.adapter) ?? []), item]);
  for (const [adapter, items] of criticalByAdapter) {
    lines.push("", `## Провалы критичных кейсов — ${adapter} (${items.length})`, "", "| Вопрос | Ожидалось | Получено |", "|---|---|---|");
    for (const item of items) {
      const failure = item.checks.find((check) => !check.ok);
      const got = failure.name === "source" || failure.name === "kind" ? `${failure.name}=${failure.got}` : `«${item.answer.text.slice(0, 90)}…»`;
      lines.push(`| ${item.testCase.question} | ${failure.name}=${failure.want} | ${got} |`);
    }
  }
  await writeFile(reportPath, `${lines.join("\n")}\n`);
  console.log(`\nОтчёт записан: ${reportPath}`);
}

process.exitCode = 0;
