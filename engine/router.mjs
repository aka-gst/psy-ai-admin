// Порядок ответа: сначала границы безопасности, потом правила арендатора.
// Обнаружение опасных сообщений принадлежит движку и не настраивается через
// каталог; арендатор выбирает только текст ответа и страницу, куда вести.
import { createRetriever } from "./retrieval.mjs";
import { isClinical, isCrisis, isPossibleDistress } from "./safety-signals.mjs";

// Попытки снять роль администратора. Как и кризисный список, набор шире
// буквальных формулировок: «системный промпт» не совпадал с «системные
// инструкции», а «ты теперь свободный ИИ» не совпадало ни с чем.
const INJECTION = /игнорируй|игнорируя|забудь (все |всё )?(предыдущ|прежн|свои)|обойди.*правил|системн\w*\s*(промпт|инструкц|сообщен)|раскрой.*инструкц|покажи.*(промпт|инструкц)|ты теперь|ты больше не|сбрось настройк|стань (обычным|другим|просто)|ты не (администратор|бот|ассистент|помощник|ии)|(отвечай|говори|работай|действуй|веди себя)[^.]{0,25}без ([а-я]+ )?ограничени|режим разработчика|представь,? что ты|притворись|веди себя как|act as|system prompt|jailbreak|dan режим/i;
const PAYMENT = /карт[аы]|реквизит|cvv|парол|личн(ый|ого) кабинет|оплатить.*чат|как оплатить|оплат[аы].*участ/i;
const GUARANTEE = /гарантир|обеща.*результат|точно поможет/i;

const SAFETY = {
  crisis: { kind: "crisis", detect: isCrisis },
  injection: { kind: "boundary", detect: (question) => INJECTION.test(question) },
  payment: { kind: "boundary", detect: (question) => PAYMENT.test(question) },
  clinical: { kind: "boundary", detect: isClinical },
  guarantee: { kind: "boundary", detect: (question) => GUARANTEE.test(question) },
};

export const safetyStepNames = Object.keys(SAFETY);

export function createRouter(catalog) {
  for (const step of catalog.steps) {
    if (step.safety && !SAFETY[step.safety]) throw new Error(`Каталог арендатора: неизвестный шаг безопасности «${step.safety}»`);
  }

  // Поисковые шаги делят один индекс: корпус не зависит от вопроса.
  const retrievers = new Map();
  for (const step of catalog.steps) {
    if (step.search) retrievers.set(step, createRetriever(catalog.documents, step.search));
  }

  const answer = (responseKey, sourceKeys, kind, via) => ({
    text: catalog.responses[responseKey],
    sourceKeys,
    kind,
    via,
  });

  return function route(input, lastSourceKey) {
    const question = String(input ?? "").trim();
    if (!question) return answer(catalog.empty.responseKey, catalog.empty.sourceKeys, catalog.empty.kind, "empty");

    for (const step of catalog.steps) {
      if (step.safety) {
        const check = SAFETY[step.safety];
        if (check.detect(question)) return answer(step.responseKey, step.sourceKeys, step.kind ?? check.kind, "safety");
        continue;
      }
      if (step.followUp) {
        if (lastSourceKey && step.followUp.test(question)) return answer(step.responseKey, [lastSourceKey], step.kind ?? "context", "followUp");
        continue;
      }
      if (step.search) {
        const found = retrievers.get(step)(question);
        if (found) {
          const { sourceKey, answer: prepared, confirmed } = found.document;
          if (prepared && confirmed) return { text: prepared, sourceKeys: [sourceKey], kind: step.kind ?? "route", via: "faq" };
          return answer(catalog.sources[sourceKey].response, [sourceKey], step.kind ?? "route", "search");
        }
        continue;
      }
      if (step.match.test(question)) return answer(step.responseKey, step.sourceKeys, step.kind ?? "route", "rule");
    }

    if (catalog.fallback.distress && isPossibleDistress(question)) {
      const { responseKey, sourceKeys, kind } = catalog.fallback.distress;
      return answer(responseKey, sourceKeys, kind, "distress");
    }
    return answer(catalog.fallback.responseKey, catalog.fallback.sourceKeys, catalog.fallback.kind, "fallback");
  };
}
