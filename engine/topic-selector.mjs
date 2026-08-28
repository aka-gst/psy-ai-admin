// Выбор темы языковой моделью вместо перебора регулярных выражений.
//
// Модель ничего не сочиняет: она называет одну из тем каталога либо признаёт,
// что подходящей нет. Текст ответа остаётся заранее написанным и утверждённым.
// Поэтому весь набор проверок маршрутизации продолжает измерять продукт: ошибка
// модели — это не та страница, а не выдуманный факт.
import { createChatClient } from "./llm-client.mjs";

// Примеры отказа взяты из выгоревших наборов: подсказка не настраивается на
// действующий отложенный набор.
export const SELECTOR_INSTRUCTION = `Ты подбираешь раздел сайта, в котором посетитель найдёт ответ на свой вопрос.
Ответь ровно одним словом — кодом подходящего раздела из списка.
Если вопрос не о центре и его услугах, ответь НЕТ. Лучше ответить НЕТ, чем выбрать раздел, где ответа на самом деле нет.
Не объясняй выбор и не добавляй ничего к ответу.

Примеры отказа:
Вопрос: Как приготовить борщ?
Раздел: НЕТ
Вопрос: Посоветуйте книгу по программированию
Раздел: НЕТ
Вопрос: Который час в Токио?
Раздел: НЕТ

Разделы:`;

const readKey = (raw, keys) => {
  const text = String(raw ?? "").toLowerCase();
  if (!text) return null;
  if (/\bнет\b/.test(text)) return null;
  // Совпадение по границе слова, иначе «programs» проглотит «program».
  const hit = keys.filter((key) => new RegExp(`(^|[^a-z])${key}([^a-z]|$)`).test(text));
  return hit.length === 1 ? hit[0] : null;
};

export function createTopicSelector(options = {}) {
  const { topics = [], cacheLimit = 500, client, ask } = options;
  const chat = ask ?? client ?? createChatClient(options);
  const keys = topics.map((topic) => topic.key);
  const catalogue = topics.map((topic) => `${topic.key}: ${topic.hint}`).join("\n");
  const cache = new Map();

  // Возвращает ключ темы или null — «подходящей темы нет» и «спросить не
  // удалось» здесь намеренно неразличимы: в обоих случаях помощник обязан
  // честно признать незнание, а не выбрать наугад.
  return async function select(question) {
    const key = String(question ?? "").trim().toLowerCase();
    if (!key || !keys.length) return null;
    if (cache.has(key)) return cache.get(key);

    const answer = readKey(await chat([
      { role: "user", content: `${SELECTOR_INSTRUCTION}\n${catalogue}\n\nВопрос: ${question}\nРаздел:` },
    ], { maxTokens: 12 }), keys);
    if (answer === null) return null;
    if (cache.size >= cacheLimit) cache.delete(cache.keys().next().value);
    cache.set(key, answer);
    return answer;
  };
}
