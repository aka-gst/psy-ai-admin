"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { center, demoGuide, quickQuestions, uiCopy } from "./content.js";
import { preparedQuestions, routeQuestion, sources } from "./safe-router.js";

type SourceKey = keyof typeof sources;
type Verdict = "correct" | "fix" | "missing";
type Message = { who: "assistant" | "user"; text: string; sourceKeys?: SourceKey[]; kind?: string; live?: string; questionId?: string };
type PreparedQuestion = { category: string; question: string };
type ReviewQuestion = PreparedQuestion & { id: string };
type HealthItem = { key: string; label: string; url: string; available: boolean; status: number | null };

const greeting: Message = {
  who: "assistant",
  text: uiCopy.greeting,
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [query, setQuery] = useState("");
  const [lastSource, setLastSource] = useState<SourceKey>();
  const [isChecking, setIsChecking] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState("");
  const [health, setHealth] = useState<{ checking: boolean; available?: number; total?: number; results?: HealthItem[] }>({ checking: false });
  const [feedback, setFeedback] = useState<Record<string, Verdict>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const questionGroups = (preparedQuestions as PreparedQuestion[]).reduce<Record<string, string[]>>((groups, item) => {
    (groups[item.category] ??= []).push(item.question);
    return groups;
  }, {});

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem("psy-ai-admin-review-v1");
        if (saved) setFeedback(JSON.parse(saved));
      } catch {
        // Повреждённые локальные данные не должны мешать работе демо.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function ask(value: string) {
    const clean = value.trim();
    if (!clean || isChecking) return;
    const answer = routeQuestion(clean, lastSource) as { text: string; sourceKeys: SourceKey[]; kind: string };
    const prepared = (preparedQuestions as ReviewQuestion[]).find((item) => item.question === clean);
    setMessages((current) => [...current, { who: "user", text: clean }, { who: "assistant", ...answer, questionId: prepared?.id }]);
    setQuery("");
    setLastSource(answer.sourceKeys[0]);

    const liveKey = answer.sourceKeys.find((key) => sources[key]?.dynamic);
    if (!liveKey) return;
    setIsChecking(true);
    try {
      const response = await fetch(`/api/live?topic=${liveKey}`);
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json();
      setMessages((current) => [...current, {
        who: "assistant",
        text: uiCopy.liveSuccess,
        sourceKeys: [liveKey],
        live: data.checkedAt,
      }]);
    } catch {
      setMessages((current) => [...current, {
        who: "assistant",
        text: uiCopy.liveFailure,
        sourceKeys: [liveKey],
        kind: "unknown",
      }]);
    } finally {
      setIsChecking(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(query);
  }

  async function checkLinks() {
    setHealth({ checking: true });
    try {
      const response = await fetch("/api/health");
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json();
      setHealth({ checking: false, available: data.available, total: data.total, results: data.results });
    } catch {
      setHealth({ checking: false, available: 0, total: Object.keys(sources).length });
    }
  }

  function review(questionId: string, verdict: Verdict) {
    setFeedback((current) => {
      const next = { ...current, [questionId]: verdict };
      localStorage.setItem("psy-ai-admin-review-v1", JSON.stringify(next));
      return next;
    });
  }

  function clearReview() {
    localStorage.removeItem("psy-ai-admin-review-v1");
    setFeedback({});
  }

  const reviewCounts = {
    reviewed: Object.keys(feedback).length,
    correct: Object.values(feedback).filter((value) => value === "correct").length,
    fix: Object.values(feedback).filter((value) => value === "fix").length,
    missing: Object.values(feedback).filter((value) => value === "missing").length,
  };
  const flaggedQuestions = (preparedQuestions as ReviewQuestion[]).filter((item) => feedback[item.id] === "fix" || feedback[item.id] === "missing");

  return (
    <main>
      <header>
        <p className="eyebrow">{uiCopy.eyebrow}</p>
        <h1>{uiCopy.headlineMain}<br /><em>{uiCopy.headlineAccent}</em></h1>
        <p className="lead">{uiCopy.lead}</p>
        <div className="notice">{uiCopy.privacyNotice}</div>
        <div className="choices">
          <button onClick={() => inputRef.current?.focus()}><b>Спросить помощника</b><span>Получить ответ по открытым страницам прямо сейчас</span></button>
          <a href={center.officialSiteUrl} target="_blank" rel="noreferrer"><b>Связаться с центром</b><span>Открыть официальный сайт и контакты администратора</span></a>
        </div>
      </header>

      <section className="demo-guide" aria-label="Инструкция проверки демо">
        <div className="demo-status">
          <span><b>{preparedQuestions.length}</b> готовых сценариев</span>
          <span><b>{Object.keys(sources).length}</b> официальных страниц</span>
          <span><b>0</b> сохраняемых сообщений</span>
        </div>
        <details>
          <summary>{uiCopy.guideTitle}</summary>
          <p>{uiCopy.guideIntro}</p>
          <ol>
            {demoGuide.map((step: { title: string; text: string }) => (
              <li key={step.title}><b>{step.title}</b><span>{step.text}</span></li>
            ))}
          </ol>
        </details>
      </section>

      <section className="chat" aria-label="Демонстрационный чат">
        <div className="bar"><b>Организационный вопрос</b><button onClick={() => { setMessages([greeting]); setLastSource(undefined); }}>Начать заново</button></div>
        <div className="messages" aria-live="polite">
          {messages.map((message, index) => (
            <article key={index} className={`${message.who} ${message.kind ?? ""}`}>
              <p>{message.text}</p>
              {message.live && <small>Проверено сейчас · содержимое не сохраняется</small>}
              {message.sourceKeys?.map((key) => (
                <a key={key} href={sources[key].url} target="_blank" rel="noreferrer">
                  <b>{sources[key].label} →</b><span>{sources[key].description}</span>
                </a>
              ))}
              {message.questionId && (
                <div className="answer-review" aria-label="Оценка подготовленного ответа">
                  <span>Оцените ответ:</span>
                  <button className={feedback[message.questionId] === "correct" ? "selected" : ""} onClick={() => review(message.questionId!, "correct")}>Верно</button>
                  <button className={feedback[message.questionId] === "fix" ? "selected" : ""} onClick={() => review(message.questionId!, "fix")}>Нужно исправить</button>
                  <button className={feedback[message.questionId] === "missing" ? "selected" : ""} onClick={() => review(message.questionId!, "missing")}>Не хватает ответа</button>
                </div>
              )}
            </article>
          ))}
          {isChecking && <div className="checking" role="status">Проверяю официальную страницу…</div>}
        </div>
        <div className="suggest">
          {quickQuestions.map((item: { label: string; question: string }) => (
            <button key={item.label} onClick={() => void ask(item.question)}>{item.label}</button>
          ))}
        </div>
        <div className="prepared">
          <div>
            <b>{uiCopy.preparedTitle}</b>
            <span>{uiCopy.preparedDescription}</span>
          </div>
          <div className="prepared-controls">
            <label className="sr-only" htmlFor="prepared-question">Готовый проверочный вопрос</label>
            <select id="prepared-question" value={selectedQuestion} onChange={(event) => setSelectedQuestion(event.target.value)}>
              <option value="">Выберите вопрос из списка</option>
              {Object.entries(questionGroups).map(([category, questions]) => (
                <optgroup key={category} label={category}>
                  {questions.map((question) => <option key={question} value={question}>{question}</option>)}
                </optgroup>
              ))}
            </select>
            <button type="button" disabled={!selectedQuestion || isChecking} onClick={() => void ask(selectedQuestion)}>Проверить вопрос</button>
          </div>
        </div>
        <div className="health">
          <div>
            <b>{uiCopy.healthTitle}</b>
            <span>{uiCopy.healthDescription}</span>
          </div>
          <button type="button" disabled={health.checking} onClick={() => void checkLinks()}>
            {health.checking ? "Проверяю страницы…" : "Проверить все ссылки"}
          </button>
          {health.total !== undefined && (
            <div className="health-result" role="status">
              <strong>{health.available} из {health.total} страниц доступны</strong>
              {health.results && <ul>{health.results.map((item) => (
                <li key={item.key} className={item.available ? "available" : "unavailable"}>
                  <span aria-hidden="true">{item.available ? "✓" : "!"}</span>
                  <a href={item.url} target="_blank" rel="noreferrer">{item.label}</a>
                </li>
              ))}</ul>}
            </div>
          )}
        </div>
        <form onSubmit={submit}>
          <label className="sr-only" htmlFor="question">Вопрос помощнику</label>
          <input ref={inputRef} id="question" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Например: Где посмотреть расписание?" autoComplete="off" required />
          <button disabled={isChecking}>{isChecking ? "Проверяю…" : "Получить ответ"}</button>
        </form>
      </section>

      <section className="review-results" aria-labelledby="review-results-title">
        <div className="review-heading">
          <div><p>ЛОКАЛЬНЫЙ РЕЖИМ ПРОВЕРКИ</p><h2 id="review-results-title">Результаты проверки</h2></div>
          {reviewCounts.reviewed > 0 && <button onClick={clearReview}>Сбросить оценки</button>}
        </div>
        <p>Оценки сохраняются только в этом браузере. Тексты вопросов, сообщения и контакты никуда не отправляются.</p>
        <div className="review-stats">
          <span><b>{reviewCounts.reviewed}</b> из {preparedQuestions.length} проверено</span>
          <span><b>{reviewCounts.correct}</b> верно</span>
          <span><b>{reviewCounts.fix}</b> исправить</span>
          <span><b>{reviewCounts.missing}</b> не хватает ответа</span>
        </div>
        {flaggedQuestions.length > 0 ? (
          <ul>{flaggedQuestions.map((item) => (
            <li key={item.id}><span>{feedback[item.id] === "fix" ? "Исправить" : "Не хватает"}</span>{item.question}</li>
          ))}</ul>
        ) : (
          <div className="review-empty">Выберите вопрос из списка, получите ответ и поставьте оценку.</div>
        )}
      </section>

      <footer><span>Проект не связан с центром «{center.name}».</span><span>Используются только открытые страницы.</span><span>Реальные заявки не отправляются.</span></footer>
    </main>
  );
}
