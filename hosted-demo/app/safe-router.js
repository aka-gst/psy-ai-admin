// Витрина не содержит собственной логики маршрутизации: правила безопасности и
// порядок ответа приходят из общего движка, контент — из center-content.json.
import { createAssistant } from "../../engine/index.mjs";
import catalog from "./center-content.json" with { type: "json" };

export { preparedQuestions } from "./content.js";

const assistant = createAssistant(catalog);

export const sources = assistant.sources;

export function routeQuestion(input, lastSourceKey) {
  return assistant.ask(input, lastSourceKey);
}
