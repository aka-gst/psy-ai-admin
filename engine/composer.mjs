// Свободный ответ: модель формулирует своими словами вместо заготовки.
//
// Устройство намеренно узкое. Страницу по-прежнему выбирает движок — правила,
// поиск или селектор, — и всё, что измерено на наборах, продолжает измеряться.
// Модель получает только материал выбранной страницы и переписывает его живым
// языком. Она решает, КАК сказать, а не ЧТО правда.
//
// Границы безопасности проходят до этого шага и сюда не попадают вовсе:
// кризисное сообщение, вопрос о лекарствах и попытка снять роль получают
// заранее написанный ответ и никогда не отдаются на сочинение.

const DIGITS = /\d+/g;

export const COMPOSE_PROMPT = `Ты администратор психологического центра и отвечаешь посетителю сайта.

Отвечай ТОЛЬКО по сведениям ниже. Если в них нет ответа — так и скажи и предложи открыть страницу.
Не придумывай цены, даты, время, адреса, имена и условия: любое число должно встречаться в сведениях.
Не давай советов о здоровье, не ставь диагнозов, не обещай результат.
Две-три короткие фразы, без приветствия и без подписи.`;

// Число, которого нет в исходном материале, — самый дорогой вид выдумки:
// названная цена или дата выглядит как факт центра. Такой ответ отвергается.
export function inventedNumbers(answer, context) {
  const allowed = new Set(String(context).match(DIGITS) ?? []);
  return [...new Set(String(answer).match(DIGITS) ?? [])].filter((value) => !allowed.has(value));
}

export function createComposer(options = {}) {
  const { ask, client, maxSentences = 3, prompt = COMPOSE_PROMPT } = options;
  const chat = ask ?? client;

  // Возвращает текст или null. null означает «не сочинилось» — вызывающая
  // сторона обязана вернуть заранее написанный ответ, а не пустоту.
  return async function compose({ question, context, fallback }) {
    if (!chat || !context) return null;
    const raw = await chat([
      { role: "user", content: `${prompt}\n\nСведения:\n${context}\n\nВопрос посетителя: ${question}\nОтвет:` },
    ], { maxTokens: 140 });
    if (!raw) return null;

    const answer = String(raw).trim().replace(/^["«]|["»]$/g, "");
    if (answer.length < 12) return null;
    // Слишком длинный ответ — признак того, что модель ушла рассуждать.
    if (answer.length > 700) return null;
    if (inventedNumbers(answer, `${context} ${fallback ?? ""}`).length) return null;
    return answer.split(/(?<=[.!?])\s+/).slice(0, maxSentences).join(" ").trim();
  };
}

// Материал для ответа: подпись, описание и текст страницы плюс подтверждённые
// записи FAQ, относящиеся к ней. Ничего сверх того, что уже утверждено.
export function contextForSource(catalog, sourceKey) {
  const source = catalog.sources?.[sourceKey];
  if (!source) return "";
  const parts = [source.label, source.description, source.about];
  if (source.response && catalog.responses?.[source.response]) parts.push(catalog.responses[source.response]);
  for (const entry of catalog.faq ?? []) {
    if (entry.source === sourceKey && entry.confirmed) parts.push(entry.text);
  }
  return parts.filter(Boolean).join(" ");
}
