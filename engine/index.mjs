// Общий движок безопасного администратора. Одна реализация обслуживает и
// публичную витрину, и серверный продукт: правило безопасности, добавленное
// здесь, действует в обоих сразу.
import { prepareCatalog } from "./catalog.mjs";
import { createComposer, contextForSource } from "./composer.mjs";
import { createCrisisClassifier } from "./crisis-classifier.mjs";
import { createChatClient, clientFromEnvironment } from "./llm-client.mjs";
import { createTopicSelector } from "./topic-selector.mjs";
import { createRouter, safetyStepNames } from "./router.mjs";

export { prepareCatalog, safetyStepNames, createCrisisClassifier, createChatClient, clientFromEnvironment, createTopicSelector, createComposer, contextForSource };

// Темы для селектора берутся из тех же описаний источников, что и поиск.
export const topicsFromCatalog = (catalog) => Object.entries(catalog.sources ?? {})
  .filter(([, source]) => source.response)
  .map(([key, source]) => ({ key, hint: [source.label, source.description, source.about].filter(Boolean).join(" ").slice(0, 240) }));
export { isClinical, isCrisis, signalGroups } from "./safety-signals.mjs";

export function createAssistant(rawCatalog, options = {}) {
  const catalog = prepareCatalog(rawCatalog);
  const route = createRouter(catalog, options);
  return {
    // Асинхронный: распознавание кризиса вторым рубежом требует запроса к
    // локальной модели. Без классификатора ответ возвращается сразу.
    ask: (question, lastSourceKey) => route(question, lastSourceKey),
    center: catalog.center,
    sources: catalog.sources,
    responses: catalog.responses,
  };
}
