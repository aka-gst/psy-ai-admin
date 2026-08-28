// Единственное место, где движок ходит к языковой модели.
//
// Настройка — три переменные: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL. Смена
// мозга должна означать смену настроек, а не переписывание кода.
//
// Диалектов при этом два, и это вынужденно. Целевой контракт —
// OpenAI-совместимый /v1/chat/completions. Но локальная Ollama на своём
// /v1-слое не умеет отключать рассуждения модели: замер 28 августа 2026 на
// qwen3:8b — 13 секунд, 300 токенов рассуждений и пустой ответ, при том что
// нативный /api/generate с think:false отвечает тем же вердиктом за 400 мс.
// Поэтому клиент говорит на обоих: диалект выбирается по адресу и явно
// переопределяется через LLM_TRANSPORT.

const stripReasoning = (text) => String(text ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

const flatten = (messages) => messages.map((message) => message.content).join("\n\n");

export function createChatClient(options = {}) {
  const {
    baseUrl = "http://127.0.0.1:11434",
    apiKey = "local",
    model = "qwen3:8b",
    timeoutMs = 8000,
    request = globalThis.fetch,
    transport = /\/v1\/?$/.test(baseUrl) ? "openai" : "ollama",
  } = options;

  const root = baseUrl.replace(/\/$/, "");

  const call = (messages, maxTokens, signal) => transport === "openai"
    ? request(`${root}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      signal,
      body: JSON.stringify({ model, messages, temperature: 0, max_tokens: maxTokens, stream: false }),
    })
    : request(`${root}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({ model, prompt: flatten(messages), stream: false, think: false, options: { temperature: 0, num_predict: maxTokens } }),
    });

  const readAnswer = async (response) => {
    const data = await response.json();
    return transport === "openai" ? data?.choices?.[0]?.message?.content : data?.response;
  };

  // Возвращает строку ответа или null. null означает «спросить не удалось» —
  // вызывающая сторона обязана отличать это от содержательного ответа.
  return async function ask(messages, { maxTokens = 16 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await call(messages, maxTokens, controller.signal);
      if (!response?.ok) return null;
      return stripReasoning(await readAnswer(response)) || null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}

export const transportFor = (baseUrl) => (/\/v1\/?$/.test(baseUrl ?? "") ? "openai" : "ollama");

export function clientFromEnvironment(env = process.env, overrides = {}) {
  if (!env.LLM_BASE_URL) return null;
  return createChatClient({
    baseUrl: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY || "local",
    model: env.LLM_MODEL || "qwen3:8b",
    ...(env.LLM_TRANSPORT ? { transport: env.LLM_TRANSPORT } : {}),
    ...overrides,
  });
}
