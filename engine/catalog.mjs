// Каталог арендатора: тексты, страницы и порядок правил маршрутизации.
// Движок проверяет каталог до первого вопроса — неполный каталог не должен
// обнаруживаться на живом посетителе.

const REQUIRED_SAFETY = ["crisis", "injection", "payment", "clinical"];

const isUsableUrl = (url) => {
  if (typeof url !== "string" || !url) return false;
  if (url.startsWith("/")) return true;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
};

const interpolate = (value, center) => value.replace(/\{\{(\w+)\}\}/g, (_, key) => center[key] ?? "");

export function prepareCatalog(raw) {
  const fail = (message) => {
    throw new Error(`Каталог арендатора: ${message}`);
  };

  const { center, sources, responses, pipeline, fallback, empty } = raw ?? {};
  if (!center || typeof center !== "object") fail("отсутствует раздел center");
  if (!sources || typeof sources !== "object") fail("отсутствует раздел sources");
  if (!responses || typeof responses !== "object") fail("отсутствует раздел responses");
  if (!Array.isArray(pipeline) || !pipeline.length) fail("отсутствует раздел pipeline");

  for (const [key, source] of Object.entries(sources)) {
    if (!isUsableUrl(source?.url)) fail(`источник «${key}» указывает не на https-адрес и не на путь своего сайта`);
    if (!source.label) fail(`у источника «${key}» нет подписи`);
  }
  for (const [key, text] of Object.entries(responses)) {
    if (typeof text !== "string" || !text.trim()) fail(`ответ «${key}» пуст`);
  }

  // Кризис проверяется раньше всего: ни одно правило арендатора не может
  // оказаться перед ним и перехватить сообщение о риске для жизни.
  if (pipeline[0]?.safety !== "crisis") fail("первым шагом pipeline должен быть { \"safety\": \"crisis\" }");
  const declared = new Set(pipeline.filter((step) => step.safety).map((step) => step.safety));
  for (const name of REQUIRED_SAFETY) {
    if (!declared.has(name)) fail(`в pipeline нет обязательного шага безопасности «${name}»`);
  }

  const steps = pipeline.map((step, index) => {
    const responseKey = step.response ?? step.safety;
    if (!responseKey) fail(`шаг ${index} не указывает ответ`);
    if (!(responseKey in responses)) fail(`шаг ${index} ссылается на несуществующий ответ «${responseKey}»`);
    const sourceKeys = step.safety === "crisis" ? [] : (step.sources ?? []);
    for (const key of sourceKeys) {
      if (!(key in sources)) fail(`шаг ${index} ссылается на несуществующий источник «${key}»`);
    }
    if (step.match && step.safety) fail(`шаг ${index}: шаг безопасности не настраивается регулярным выражением`);
    if (!step.safety && !step.match && !step.followUp) fail(`шаг ${index} не содержит ни safety, ни match, ни followUp`);
    return {
      safety: step.safety ?? null,
      match: step.match ? new RegExp(step.match, "i") : null,
      followUp: step.followUp ? new RegExp(step.followUp, "i") : null,
      responseKey,
      sourceKeys,
      kind: step.kind ?? null,
    };
  });

  const resolveTerminal = (value, name, defaultKind) => {
    if (!value?.response) fail(`отсутствует раздел ${name}`);
    if (!(value.response in responses)) fail(`${name} ссылается на несуществующий ответ «${value.response}»`);
    for (const key of value.sources ?? []) {
      if (!(key in sources)) fail(`${name} ссылается на несуществующий источник «${key}»`);
    }
    return { responseKey: value.response, sourceKeys: value.sources ?? [], kind: value.kind ?? defaultKind };
  };

  return Object.freeze({
    center: Object.freeze({ ...center }),
    sources: Object.freeze({ ...sources }),
    responses: Object.freeze(Object.fromEntries(Object.entries(responses).map(([key, text]) => [key, interpolate(text, center)]))),
    steps,
    fallback: resolveTerminal(fallback, "fallback", "unknown"),
    empty: resolveTerminal(empty, "empty", "route"),
  });
}
