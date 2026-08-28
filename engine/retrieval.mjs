// Поиск по документам арендатора вместо перебора регулярных выражений.
// BM25 на десятке коротких описаний страниц: без индексов, без зависимостей,
// пересчёт всего корпуса занимает доли миллисекунды.
//
// Порог существует, чтобы помощник по-прежнему умел говорить «не знаю».
// Ранжирование всегда возвращает лучший документ, даже для вопроса о погоде;
// без порога честное незнание превратилось бы в уверенную ошибку.
import { tokenize } from "./text.mjs";

const K1 = 1.2;
const B = 0.75;

export function createRetriever(documents, options = {}) {
  const minScore = options.minScore ?? 3;
  const corpus = documents.map((document) => {
    const terms = tokenize(document.text);
    const frequency = new Map();
    for (const term of terms) frequency.set(term, (frequency.get(term) ?? 0) + 1);
    return { sourceKey: document.sourceKey, frequency, length: terms.length };
  });

  const documentCount = corpus.length;
  const averageLength = documentCount ? corpus.reduce((total, item) => total + item.length, 0) / documentCount : 0;
  const containing = new Map();
  for (const item of corpus) {
    for (const term of item.frequency.keys()) containing.set(term, (containing.get(term) ?? 0) + 1);
  }
  const idf = (term) => {
    const count = containing.get(term) ?? 0;
    if (!count) return 0;
    return Math.log(1 + (documentCount - count + 0.5) / (count + 0.5));
  };

  return function search(question) {
    const terms = tokenize(question);
    if (!terms.length || !documentCount) return null;
    const ranked = corpus
      .map((item) => {
        let score = 0;
        for (const term of terms) {
          const frequency = item.frequency.get(term);
          if (!frequency) continue;
          score += idf(term) * ((frequency * (K1 + 1)) / (frequency + K1 * (1 - B + (B * item.length) / averageLength)));
        }
        return { sourceKey: item.sourceKey, score };
      })
      .sort((left, right) => right.score - left.score);

    const best = ranked[0];
    if (!best || best.score < minScore) return null;
    return { sourceKey: best.sourceKey, score: best.score, runnerUp: ranked[1]?.score ?? 0 };
  };
}
