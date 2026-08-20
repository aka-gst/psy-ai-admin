"use client";

import { FormEvent, useRef, useState } from "react";
import { routeQuestion, sources } from "./safe-router.js";

type SourceKey = keyof typeof sources;
type Message = { who: "assistant" | "user"; text: string; sourceKeys?: SourceKey[]; kind?: string; live?: string };

const greeting: Message = {
  who: "assistant",
  text: "Здравствуйте. Я помогу найти открытую страницу с расписанием, консультациями, программами, клубом или арендой. О чём хотите узнать?",
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [query, setQuery] = useState("");
  const [lastSource, setLastSource] = useState<SourceKey>();
  const [isChecking, setIsChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function ask(value: string) {
    const clean = value.trim();
    if (!clean || isChecking) return;
    const answer = routeQuestion(clean, lastSource) as { text: string; sourceKeys: SourceKey[]; kind: string };
    setMessages((current) => [...current, { who: "user", text: clean }, { who: "assistant", ...answer }]);
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
        text: "Официальная страница доступна и проверена по вашему запросу. Откройте её, чтобы увидеть актуальные даты, цены и условия.",
        sourceKeys: [liveKey],
        live: data.checkedAt,
      }]);
    } catch {
      setMessages((current) => [...current, {
        who: "assistant",
        text: "Сейчас не удалось проверить официальную страницу. Не буду угадывать — откройте её напрямую или уточните у администратора.",
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

  return (
    <main>
      <header>
        <p className="eyebrow">НЕЗАВИСИМОЕ ДЕМО · СООБЩЕНИЯ НЕ СОХРАНЯЮТСЯ</p>
        <h1>AI-администратор<br /><em>для вопросов о центре</em></h1>
        <p className="lead">Безопасная навигация по открытым страницам психологического центра. Демо не является психологом, врачом или экстренной службой.</p>
        <div className="notice">Не вводите медицинские подробности, реквизиты, пароли или данные личного кабинета.</div>
        <div className="choices">
          <button onClick={() => inputRef.current?.focus()}><b>Спросить помощника</b><span>Получить ответ по открытым страницам прямо сейчас</span></button>
          <a href="https://orion-center.ru/" target="_blank" rel="noreferrer"><b>Связаться с центром</b><span>Открыть официальный сайт и контакты администратора</span></a>
        </div>
      </header>

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
            </article>
          ))}
          {isChecking && <div className="checking" role="status">Проверяю официальную страницу…</div>}
        </div>
        <div className="suggest">
          <button onClick={() => void ask("Какие мероприятия ближайшие?")}>Ближайшие мероприятия</button>
          <button onClick={() => void ask("Хочу консультацию онлайн")}>Консультация онлайн</button>
          <button onClick={() => void ask("У меня панические атаки — куда обратиться?")}>Панические атаки: куда обратиться?</button>
          <button onClick={() => void ask("Мне нужен зал на 20 человек")}>Аренда зала</button>
        </div>
        <form onSubmit={submit}>
          <label className="sr-only" htmlFor="question">Вопрос помощнику</label>
          <input ref={inputRef} id="question" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Например: Где посмотреть расписание?" autoComplete="off" required />
          <button disabled={isChecking}>{isChecking ? "Проверяю…" : "Получить ответ"}</button>
        </form>
      </section>

      <footer><span>Проект не связан с центром «Орион-С».</span><span>Используются только открытые страницы.</span><span>Реальные заявки не отправляются.</span></footer>
    </main>
  );
}
