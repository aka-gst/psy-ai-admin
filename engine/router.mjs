// Порядок ответа: сначала границы безопасности, потом правила арендатора.
// Обнаружение опасных сообщений принадлежит движку и не настраивается через
// каталог; арендатор выбирает только текст ответа и страницу, куда вести.
import { isClinical, isCrisis } from "./safety-signals.mjs";

const INJECTION = /игнорируй|обойди.*правил|системн(ые|ые инструкции)|раскрой.*инструкц/i;
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

  const answer = (responseKey, sourceKeys, kind) => ({
    text: catalog.responses[responseKey],
    sourceKeys,
    kind,
  });

  return function route(input, lastSourceKey) {
    const question = String(input ?? "").trim();
    if (!question) return answer(catalog.empty.responseKey, catalog.empty.sourceKeys, catalog.empty.kind);

    for (const step of catalog.steps) {
      if (step.safety) {
        const check = SAFETY[step.safety];
        if (check.detect(question)) return answer(step.responseKey, step.sourceKeys, step.kind ?? check.kind);
        continue;
      }
      if (step.followUp) {
        if (lastSourceKey && step.followUp.test(question)) return answer(step.responseKey, [lastSourceKey], step.kind ?? "context");
        continue;
      }
      if (step.match.test(question)) return answer(step.responseKey, step.sourceKeys, step.kind ?? "route");
    }

    return answer(catalog.fallback.responseKey, catalog.fallback.sourceKeys, catalog.fallback.kind);
  };
}
