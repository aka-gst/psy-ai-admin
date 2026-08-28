// Общий движок безопасного администратора. Одна реализация обслуживает и
// публичную витрину, и серверный продукт: правило безопасности, добавленное
// здесь, действует в обоих сразу.
import { prepareCatalog } from "./catalog.mjs";
import { createCrisisClassifier } from "./crisis-classifier.mjs";
import { createRouter, safetyStepNames } from "./router.mjs";

export { prepareCatalog, safetyStepNames, createCrisisClassifier };
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
