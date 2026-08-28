// Адаптеры приводят разные реализации роутера к одному виду ответа,
// чтобы один и тот же набор вопросов мерился для всех версий одинаково.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = new URL("../../", import.meta.url);

const normalise = (raw) => ({
  kind: raw?.kind ?? "route",
  sourceKey: raw?.sourceKeys?.[0] ?? null,
  text: raw?.text ?? "",
});

async function loadPrototype() {
  const indexPath = new URL("demo/public-content-index.js", repoRoot);
  const indexLoaded = existsSync(fileURLToPath(indexPath));
  if (indexLoaded) await import(indexPath.href);
  await import(new URL("demo/safe-router.js", repoRoot).href);
  const route = globalThis.routeQuestion;
  return {
    id: "prototype",
    title: "demo/ — первый прототип",
    note: indexLoaded
      ? "поиск по локальному индексу публичного снимка включён"
      : "индекс публичного снимка отсутствует, поиск отключён",
    ask: (question, lastSourceKey) => normalise(route(question, lastSourceKey ? { lastSourceKey } : {})),
  };
}

async function loadHosted() {
  const { routeQuestion } = await import(new URL("hosted-demo/app/safe-router.js", repoRoot).href);
  return {
    id: "hosted",
    title: "hosted-demo/ — публичная витрина",
    note: "контент вынесен в center-content.json",
    ask: (question, lastSourceKey) => normalise(routeQuestion(question, lastSourceKey)),
  };
}

export async function loadAdapters(only) {
  const loaders = { prototype: loadPrototype, hosted: loadHosted };
  const wanted = only?.length ? only : Object.keys(loaders);
  const adapters = [];
  for (const id of wanted) {
    if (!loaders[id]) throw new Error(`Неизвестная реализация: ${id}`);
    adapters.push(await loaders[id]());
  }
  return adapters;
}
