import assert from "node:assert/strict";
import test from "node:test";
import { createChatClient, clientFromEnvironment, transportFor } from "./llm-client.mjs";

const openAiReply = (text) => ({ ok: true, json: async () => ({ choices: [{ message: { content: text } }] }) });
const ollamaReply = (text) => ({ ok: true, json: async () => ({ response: text }) });

test("диалект выбирается по адресу и переопределяется явно", () => {
  assert.equal(transportFor("https://api.example.com/v1"), "openai");
  assert.equal(transportFor("https://api.example.com/v1/"), "openai");
  assert.equal(transportFor("http://127.0.0.1:11434"), "ollama");
});

test("OpenAI-совместимый вызов уходит с ключом и нулевой температурой", async () => {
  const log = [];
  const ask = createChatClient({ baseUrl: "https://api.example.com/v1", apiKey: "k", model: "m", request: async (url, init) => { log.push({ url, init }); return openAiReply("ОБЫЧНОЕ"); } });
  assert.equal(await ask([{ role: "user", content: "привет" }]), "ОБЫЧНОЕ");
  assert.equal(log[0].url, "https://api.example.com/v1/chat/completions");
  assert.equal(log[0].init.headers.authorization, "Bearer k");
  const body = JSON.parse(log[0].init.body);
  assert.equal(body.model, "m");
  assert.equal(body.temperature, 0);
  assert.equal(body.stream, false);
});

test("нативный вызов Ollama идёт на /api/generate с выключенными рассуждениями", async () => {
  const log = [];
  const ask = createChatClient({ baseUrl: "http://127.0.0.1:11434", model: "qwen3:8b", request: async (url, init) => { log.push({ url, init }); return ollamaReply("РИСК"); } });
  assert.equal(await ask([{ role: "user", content: "тест" }]), "РИСК");
  assert.equal(log[0].url, "http://127.0.0.1:11434/api/generate");
  assert.equal(JSON.parse(log[0].init.body).think, false);
});

test("рассуждения в теге think не попадают в ответ", async () => {
  const ask = createChatClient({ baseUrl: "http://x/v1", request: async () => openAiReply("<think>долго думаю</think>  РИСК ") });
  assert.equal(await ask([{ role: "user", content: "тест" }]), "РИСК");
});

test("пустой ответ, ошибка и таймаут одинаково означают «спросить не удалось»", async () => {
  assert.equal(await createChatClient({ request: async () => ollamaReply("   ") })([{ role: "user", content: "т" }]), null);
  assert.equal(await createChatClient({ request: async () => ({ ok: false, json: async () => ({}) }) })([{ role: "user", content: "т" }]), null);
  assert.equal(await createChatClient({ request: async () => { throw new Error("сеть"); } })([{ role: "user", content: "т" }]), null);
  const slow = createChatClient({ timeoutMs: 20, request: (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")))) });
  assert.equal(await slow([{ role: "user", content: "т" }]), null);
});

test("без LLM_BASE_URL клиент не создаётся: мозг выключен по умолчанию", () => {
  assert.equal(clientFromEnvironment({}), null);
  assert.ok(clientFromEnvironment({ LLM_BASE_URL: "http://x/v1" }));
});
