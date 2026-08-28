// Распознавание кризиса по смыслу, а не по списку основ слов.
//
// Перечни шаблонов не обобщаются: пять отложенных наборов подряд находили
// столько же промахов, сколько предыдущий, а мягкая страховка на тех же
// перечнях дала ноль распознанных из шести (docs/crisis-detection-limits.md).
// Поэтому вопрос задаётся языковой модели. Модель локальная: ограничение
// «работает без платного API и без отправки сообщений наружу» сохраняется.
//
// Классификатор — второй рубеж. Первый остаётся списком шаблонов: он мгновенный
// и не зависит от того, поднята ли модель. Спрашивать модель имеет смысл только
// о сообщениях, которые шаблоны не опознали.

// Примеры взяты только из выгоревших наборов: подсказка не должна настраиваться
// на действующий отложенный набор, иначе он перестанет что-либо измерять.
export const CRISIS_PROMPT = `Ты классификатор безопасности для чата психологического центра.
Отвечай ровно одним словом: РИСК или ОБЫЧНОЕ.

РИСК — если прямо говорится или ясно подразумевается: мысли о смерти или самоубийстве, намерение причинить себе вред, безнадёжность, потеря смысла жизни, желание исчезнуть, либо тревога за близкого в таком состоянии.
ОБЫЧНОЕ — всё остальное: организационные вопросы о расписании, времени, ценах, аренде, дороге и оплате, разговорные преувеличения, вопросы о лекарствах и диагнозах без упоминания смерти, просьбы изменить твою роль.

Примеры:
Сообщение: Умираю с голоду, есть ли кафе рядом?
Ответ: ОБЫЧНОЕ
Сообщение: Мой друг говорит, что хочет умереть
Ответ: РИСК
Сообщение: Убить бы эту очередь, есть запись по времени?
Ответ: ОБЫЧНОЕ
Сообщение: Не осталось причин вставать по утрам
Ответ: РИСК
Сообщение: Помираю со скуки, что у вас интересного?
Ответ: ОБЫЧНОЕ
Сообщение: Мне незачем просыпаться завтра
Ответ: РИСК
Сообщение: Во сколько всё заканчивается?
Ответ: ОБЫЧНОЕ

Сообщение: `;

const readVerdict = (raw) => {
  const text = String(raw ?? "").toLowerCase();
  if (text.includes("риск")) return true;
  if (text.includes("обычн")) return false;
  return null;
};

export function createCrisisClassifier(options = {}) {
  const {
    baseUrl = "http://127.0.0.1:11434",
    model = "qwen3:8b",
    timeoutMs = 6000,
    request = globalThis.fetch,
    cacheLimit = 500,
    prompt = CRISIS_PROMPT,
  } = options;

  const cache = new Map();

  // Возвращает true, false или null. null означает «спросить не удалось» —
  // вызывающая сторона решает сама и обязана это различать: молчаливое
  // превращение отказа модели в «обычное сообщение» было бы худшим вариантом.
  return async function classify(text) {
    const key = String(text ?? "").trim().toLowerCase();
    if (!key) return false;
    if (cache.has(key)) return cache.get(key);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await request(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ model, prompt: `${prompt}${text}\nОтвет:`, stream: false, think: false, options: { temperature: 0, num_predict: 8 } }),
      });
      if (!response?.ok) return null;
      const verdict = readVerdict((await response.json())?.response);
      if (verdict === null) return null;
      if (cache.size >= cacheLimit) cache.delete(cache.keys().next().value);
      cache.set(key, verdict);
      return verdict;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}
