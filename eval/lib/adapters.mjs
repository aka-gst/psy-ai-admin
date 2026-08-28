// Адаптеры приводят разные реализации роутера к одному виду ответа,
// чтобы один и тот же набор вопросов мерился для всех версий одинаково.

const repoRoot = new URL("../../", import.meta.url);

const normalise = (raw) => ({
  kind: raw?.kind ?? "route",
  sourceKey: raw?.sourceKeys?.[0] ?? null,
  text: raw?.text ?? "",
  via: raw?.via ?? null,
});

// Второй рубеж распознавания кризиса: локальная модель через Ollama. Адаптер
// существует, чтобы разницу «шаблоны» и «шаблоны плюс модель» можно было
// измерить одним и тем же набором вопросов.
async function loadHostedWithModel() {
  const [{ createAssistant, createCrisisClassifier }, catalog] = await Promise.all([
    import(new URL("engine/index.mjs", repoRoot).href),
    import(new URL("hosted-demo/app/center-content.json", repoRoot).href, { with: { type: "json" } }).then((module) => module.default),
  ]);
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const model = process.env.CHAT_MODEL || "qwen3:8b";
  const probe = await fetch(`${baseUrl}/api/tags`).catch(() => null);
  if (!probe?.ok) throw new Error(`Локальная модель недоступна: ${baseUrl}. Запустите Ollama или уберите --only model.`);
  const assistant = createAssistant(catalog, { crisisClassifier: createCrisisClassifier({ baseUrl, model, timeoutMs: 20000 }) });
  return {
    id: "model",
    title: `hosted-demo/ + локальная модель (${model})`,
    note: "кризис распознаётся вторым рубежом, когда шаблоны промолчали",
    ask: async (question, lastSourceKey) => normalise(await assistant.ask(question, lastSourceKey)),
  };
}

// Выбор темы моделью вместо перебора правил. Тексты ответов остаются
// утверждёнными, поэтому набор проверок маршрутизации измеряет продукт так же.
async function loadHostedWithSelector(withSearch = true) {
  const [engine, catalog] = await Promise.all([
    import(new URL("engine/index.mjs", repoRoot).href),
    import(new URL("hosted-demo/app/center-content.json", repoRoot).href, { with: { type: "json" } }).then((module) => module.default),
  ]);
  const baseUrl = process.env.LLM_BASE_URL || "http://127.0.0.1:11434";
  const model = process.env.LLM_MODEL || "qwen3:8b";
  const probe = await fetch(`${baseUrl.replace(/\/v1\/?$/, "")}/api/tags`).catch(() => null);
  if (!probe?.ok) throw new Error(`Модель недоступна: ${baseUrl}.`);
  const tuned = JSON.parse(JSON.stringify(catalog));
  tuned.pipeline = tuned.pipeline.filter((step) => withSearch || !step.search);
  tuned.pipeline.push({ select: true });
  const client = engine.createChatClient({ baseUrl, model, timeoutMs: 30000 });
  const assistant = engine.createAssistant(tuned, {
    crisisClassifier: engine.createCrisisClassifier({ ask: client }),
    topicSelector: engine.createTopicSelector({ topics: engine.topicsFromCatalog(tuned), ask: client }),
  });
  return {
    id: withSearch ? "selector" : "selector-only",
    title: `hosted-demo/ + выбор темы моделью (${model})${withSearch ? "" : ", без BM25"}`,
    note: "модель называет раздел, текст ответа остаётся утверждённым",
    ask: async (question, lastSourceKey) => normalise(await assistant.ask(question, lastSourceKey)),
  };
}

async function loadHosted() {
  const { routeQuestion } = await import(new URL("hosted-demo/app/safe-router.js", repoRoot).href);
  return {
    id: "hosted",
    title: "hosted-demo/ — публичная витрина",
    note: "контент и порядок правил вынесены в center-content.json",
    ask: async (question, lastSourceKey) => normalise(await routeQuestion(question, lastSourceKey)),
  };
}

export async function loadAdapters(only) {
  const loaders = { hosted: loadHosted, model: loadHostedWithModel, selector: () => loadHostedWithSelector(true), "selector-only": () => loadHostedWithSelector(false) };
  const wanted = only?.length ? only : ["hosted"];
  const adapters = [];
  for (const id of wanted) {
    if (!loaders[id]) throw new Error(`Неизвестная реализация: ${id}`);
    adapters.push(await loaders[id]());
  }
  return adapters;
}
