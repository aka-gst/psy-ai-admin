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
  const extraDocuments = raw?.documents ?? [];
  const faq = raw?.faq ?? [];
  if (!center || typeof center !== "object") fail("отсутствует раздел center");
  if (!sources || typeof sources !== "object") fail("отсутствует раздел sources");
  if (!responses || typeof responses !== "object") fail("отсутствует раздел responses");
  if (!Array.isArray(pipeline) || !pipeline.length) fail("отсутствует раздел pipeline");

  for (const [key, source] of Object.entries(sources)) {
    if (!isUsableUrl(source?.url)) fail(`источник «${key}» указывает не на https-адрес и не на путь своего сайта`);
    if (!source.label) fail(`у источника «${key}» нет подписи`);
    if (source.about && !source.response) fail(`у источника «${key}» есть описание для поиска, но не указан ответ`);
    if (source.response && !(source.response in responses)) fail(`источник «${key}» ссылается на несуществующий ответ «${source.response}»`);
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
    const responseKey = step.search ? null : (step.response ?? step.safety);
    if (!step.search) {
      if (!responseKey) fail(`шаг ${index} не указывает ответ`);
      if (!(responseKey in responses)) fail(`шаг ${index} ссылается на несуществующий ответ «${responseKey}»`);
    }
    const sourceKeys = step.safety === "crisis" ? [] : (step.sources ?? []);
    for (const key of sourceKeys) {
      if (!(key in sources)) fail(`шаг ${index} ссылается на несуществующий источник «${key}»`);
    }
    if (step.match && step.safety) fail(`шаг ${index}: шаг безопасности не настраивается регулярным выражением`);
    if (!step.safety && !step.match && !step.followUp && !step.search) fail(`шаг ${index} не содержит ни safety, ни match, ни followUp, ни search`);
    return {
      safety: step.safety ?? null,
      match: step.match ? new RegExp(step.match, "i") : null,
      followUp: step.followUp ? new RegExp(step.followUp, "i") : null,
      search: step.search ? { minScore: step.minScore ?? 3 } : null,
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

  // Описание about — минимум, который владелец сайта пишет сам. Более полный
  // корпус (выгрузка открытых страниц) подставляется через documents, не
  // попадает в репозиторий и не обязателен для работы.
  const documents = Object.entries(sources)
    .filter(([, source]) => source.about)
    .map(([sourceKey, source]) => ({ sourceKey, text: [source.label, source.description, source.about].filter(Boolean).join(" "), answer: null, confirmed: false }));
  // Ответ FAQ произносится только после подтверждения владельцем контента.
  // Неподтверждённая запись всё равно помогает найти нужную страницу, но
  // ответом становится обычный текст этой страницы: неподтверждённое не
  // выдаётся как достоверное — это свойство движка, а не дисциплины редактора.
  for (const entry of faq) {
    if (!(entry.source in sources)) fail(`запись FAQ «${entry.id ?? "?"}» ссылается на несуществующий источник «${entry.source}»`);
    if (!sources[entry.source].response) fail(`у источника «${entry.source}» есть запись FAQ, но не указан ответ`);
    if (!entry.text?.trim()) fail(`запись FAQ «${entry.id ?? "?"}» пуста`);
    documents.push({
      sourceKey: entry.source,
      text: [entry.text, entry.about].filter(Boolean).join(" "),
      answer: entry.text,
      confirmed: entry.confirmed === true,
    });
  }
  for (const document of extraDocuments) {
    if (!(document.source in sources)) fail(`documents ссылается на несуществующий источник «${document.source}»`);
    if (!sources[document.source].response) fail(`у источника «${document.source}» есть документ, но не указан ответ`);
    const existing = documents.find((item) => item.sourceKey === document.source && !item.answer);
    if (existing) existing.text += ` ${document.text}`;
    else documents.push({ sourceKey: document.source, text: document.text, answer: null, confirmed: false });
  }
  if (steps.some((step) => step.search) && !documents.length) fail("шаг search есть, а описаний about у источников нет");

  return Object.freeze({
    documents,
    center: Object.freeze({ ...center }),
    sources: Object.freeze({ ...sources }),
    responses: Object.freeze(Object.fromEntries(Object.entries(responses).map(([key, text]) => [key, interpolate(text, center)]))),
    steps,
    fallback: resolveTerminal(fallback, "fallback", "unknown"),
    empty: resolveTerminal(empty, "empty", "route"),
  });
}
