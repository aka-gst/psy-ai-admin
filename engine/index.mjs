// Общий движок безопасного администратора. Одна реализация обслуживает и
// публичную витрину, и серверный продукт: правило безопасности, добавленное
// здесь, действует в обоих сразу.
import { prepareCatalog } from "./catalog.mjs";
import { createRouter, safetyStepNames } from "./router.mjs";

export { prepareCatalog, safetyStepNames };
export { isClinical, isCrisis, signalGroups } from "./safety-signals.mjs";

export function createAssistant(rawCatalog) {
  const catalog = prepareCatalog(rawCatalog);
  const route = createRouter(catalog);
  return {
    ask: (question, lastSourceKey) => route(question, lastSourceKey),
    center: catalog.center,
    sources: catalog.sources,
    responses: catalog.responses,
  };
}
