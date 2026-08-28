// Адаптеры приводят разные реализации роутера к одному виду ответа,
// чтобы один и тот же набор вопросов мерился для всех версий одинаково.

const repoRoot = new URL("../../", import.meta.url);

const normalise = (raw) => ({
  kind: raw?.kind ?? "route",
  sourceKey: raw?.sourceKeys?.[0] ?? null,
  text: raw?.text ?? "",
  via: raw?.via ?? null,
});

async function loadHosted() {
  const { routeQuestion } = await import(new URL("hosted-demo/app/safe-router.js", repoRoot).href);
  return {
    id: "hosted",
    title: "hosted-demo/ — публичная витрина",
    note: "контент и порядок правил вынесены в center-content.json",
    ask: (question, lastSourceKey) => normalise(routeQuestion(question, lastSourceKey)),
  };
}

export async function loadAdapters(only) {
  const loaders = { hosted: loadHosted };
  const wanted = only?.length ? only : Object.keys(loaders);
  const adapters = [];
  for (const id of wanted) {
    if (!loaders[id]) throw new Error(`Неизвестная реализация: ${id}`);
    adapters.push(await loaders[id]());
  }
  return adapters;
}
