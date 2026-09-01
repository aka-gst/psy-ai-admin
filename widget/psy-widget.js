// Помощник, встраиваемый в чужой сайт одной строкой.
//
// Живёт в shadow DOM: стили сайта не попадают внутрь, наши не протекают наружу.
// Это первый вопрос любого вебмастера, поэтому решено сразу, а не потом.
//
// Логики ответа здесь нет. Виджет либо спрашивает сервер (data-endpoint), либо
// считает маршрут движком прямо в браузере. Во втором случае распознавание
// кризиса работает только на списках шаблонов — на независимом наборе это
// 0 из 6, — поэтому для показа и тем более для установки нужен сервер.
import { createAssistant } from "../engine/index.mjs";
import catalog from "../hosted-demo/app/center-content.json" with { type: "json" };
import { preparedQuestions } from "../hosted-demo/app/content.js";

const script = document.currentScript ?? document.querySelector("script[data-psy-widget]");
const endpoint = script?.dataset?.endpoint ?? "";
const local = createAssistant(catalog);

const QUICK = [
  "Свободен ли зал в субботу?",
  "Ближайшие мероприятия",
  "Хочу консультацию онлайн",
];

// Свободный режим доступен только с сервером: сочиняет модель, а в браузере
// её нет. Без сервера переключатель не показывается вовсе.
// Включён по умолчанию: заготовка — это запасной путь, а не основной.
// Выключается, чтобы показать разницу.
let freeMode = true;
const chatEndpoint = endpoint.replace(/\/api\/ask$/, "/api/chat");

const ask = async (question, lastSourceKey) => {
  if (!endpoint) {
    const answer = await local.ask(question, lastSourceKey);
    return { ...answer, sources: answer.sourceKeys.map((key) => local.sources[key]) };
  }
  const response = await fetch(freeMode ? chatEndpoint : endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, lastSourceKey }),
  });
  if (!response.ok) throw new Error("unavailable");
  return response.json();
};

const host = document.createElement("div");
host.setAttribute("data-psy-widget-root", "");
host.style.cssText = "position:fixed;inset:auto 0 0 auto;z-index:2147483000";
document.body.append(host);
const root = host.attachShadow({ mode: "open" });

root.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; font-family: Inter, "Helvetica Neue", Arial, sans-serif; }
  .launcher {
    position: fixed; right: 22px; bottom: 22px; display: flex; align-items: center; gap: 10px;
    padding: 12px 18px 12px 14px; border: 0; border-radius: 999px; cursor: pointer;
    background: #4a3585; color: #fff; font-size: 15px; font-weight: 600;
    box-shadow: 0 10px 30px rgba(32,20,64,.28);
    transition: transform .18s ease, box-shadow .18s ease;
  }
  .launcher:hover { transform: translateY(-2px); box-shadow: 0 14px 36px rgba(32,20,64,.34); }
  .launcher .dot { width: 10px; height: 10px; border-radius: 50%; background: #8ee0c0; }
  .panel {
    position: fixed; right: 22px; bottom: 22px; width: min(384px, calc(100vw - 32px));
    max-height: min(640px, calc(100vh - 44px)); display: none; flex-direction: column;
    border-radius: 18px; overflow: hidden; background: #fff; color: #1d1b2b;
    box-shadow: 0 24px 70px rgba(28,18,56,.3);
  }
  :host([open]) .panel { display: flex; }
  :host([open]) .launcher { display: none; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; background: #4a3585; color: #fff; }
  header b { font-size: 15px; }
  header small { display: block; opacity: .78; font-size: 11.5px; font-weight: 400; }
  header button { border: 0; background: transparent; color: inherit; font-size: 20px; line-height: 1; cursor: pointer; padding: 4px 6px; border-radius: 6px; }
  header button:hover { background: rgba(255,255,255,.14); }
  .log { flex: 1; overflow-y: auto; padding: 14px; display: grid; gap: 10px; background: #f7f5fb; }
  .msg { max-width: 92%; padding: 11px 14px; border-radius: 14px; font-size: 14.5px; line-height: 1.5; }
  .from-user { justify-self: end; background: #2d3d69; color: #fff; border-bottom-right-radius: 5px; }
  .from-bot { background: #fff; border: 1px solid #e2dcf0; border-bottom-left-radius: 5px; }
  .from-bot.crisis { background: #fff0ee; border-color: #e6b4b0; }
  .from-bot.boundary { background: #fff8e9; border-color: #e3cfa6; }
  .from-bot a { display: block; margin-top: 9px; padding: 10px 12px; border: 1px solid #7353b8; border-radius: 10px; color: #3e2a72; font-weight: 600; text-decoration: none; font-size: 13.5px; }
  .from-bot a:hover { background: #f6f1ff; }
  /* Молчание неотличимо от поломки: свободный ответ идёт секунды. */
  .thinking { display: flex; align-items: center; gap: 8px; padding: 11px 14px; border-radius: 14px; background: #fff; border: 1px solid #e2dcf0; color: #6d6579; font-size: 13.5px; }
  .thinking i { width: 7px; height: 7px; border-radius: 50%; background: #7d5fc6; animation: pulse 1s infinite ease-in-out; }
  @keyframes pulse { 0%, 100% { opacity: .3 } 50% { opacity: 1 } }
  @media (prefers-reduced-motion: reduce) { .thinking i { animation: none } }
  form button[disabled] { opacity: .55; cursor: default; }
  .mic { flex: 0 0 auto; width: 42px; min-height: 42px; padding: 0; border: 1px solid #cdbfe8; border-radius: 10px; background: #fff; color: #45327a; cursor: pointer; font-size: 17px; line-height: 1; }
  .mic:hover { border-color: #7d5fc6; }
  .mic[aria-pressed="true"] { background: #4a3585; border-color: #4a3585; color: #fff; }
  .mic[hidden] { display: none; }
  /* По две в ряд и во всю ширину: столбиком они съедали половину панели. */
  /* minmax(0,1fr), а не 1fr: иначе длинное слово раздвигает свою колонку. */
  .quick { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding: 0 14px 10px; background: #f7f5fb; }
  .quick button { padding: 8px 10px; border: 1px solid #cdbfe8; border-radius: 10px; background: #fff; color: #45327a; font-size: 12.5px; line-height: 1.3; text-align: center; cursor: pointer; }
  /* Нечётная последняя занимает ряд целиком, чтобы не висел огрызок. */
  .quick button:last-child:nth-child(odd) { grid-column: 1 / -1; }
  .quick button:hover { border-color: #7d5fc6; }
  .all { background: #f7f5fb; border-top: 1px solid #e6e1ef; }
  .all summary { padding: 10px 14px; font-size: 12.5px; font-weight: 600; color: #45327a; cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; }
  .all summary::-webkit-details-marker { display: none; }
  .all summary::after { content: "▾"; opacity: .55; }
  .all[open] summary::after { content: "▴"; }
  .all .list { max-height: 220px; overflow-y: auto; padding: 0 12px 12px; }
  .all h4 { margin: 10px 0 5px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #8a7fa0; }
  .all .q { display: block; width: 100%; margin-bottom: 4px; padding: 7px 10px; border: 1px solid #ddd4ee; border-radius: 8px; background: #fff; color: #3b2d63; font-size: 12.5px; text-align: left; cursor: pointer; }
  .all .q:hover { border-color: #7d5fc6; background: #f8f4ff; }
  form { display: flex; gap: 8px; padding: 12px 14px; border-top: 1px solid #e6e1ef; }
  input { flex: 1; min-width: 0; min-height: 42px; padding: 0 12px; border: 1px solid #d2c9e2; border-radius: 10px; font-size: 14.5px; }
  input:focus { outline: 2px solid #7452bd; outline-offset: -1px; }
  form button { min-height: 42px; padding: 0 16px; border: 0; border-radius: 10px; background: #4a3585; color: #fff; font-weight: 600; cursor: pointer; }
  /* Общее правило input красило и галочку: она вытягивалась в тонкую полоску
     и не читалась как переключатель. Поэтому свой вид, а не сброс. */
  .mode { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 14px 10px; padding: 9px 12px; border: 1px solid #ddd4ee; border-radius: 12px; background: #fff; cursor: pointer; }
  .mode span { display: grid; gap: 2px; }
  .mode b { color: #2f2547; font-size: 13px; font-weight: 600; }
  .mode small { color: #7c7590; font-size: 11.5px; line-height: 1.35; }
  .mode input { flex: 0 0 auto; appearance: none; -webkit-appearance: none; width: 38px; min-width: 38px; min-height: 0; height: 22px; margin: 0; padding: 0; border: 0; border-radius: 999px; background: #d5cde6; position: relative; cursor: pointer; transition: background .16s ease; }
  .mode input::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .16s ease; }
  .mode input:checked { background: #4a3585; }
  .mode input:checked::after { transform: translateX(16px); }
  .mode input:focus-visible { outline: 2px solid #7452bd; outline-offset: 2px; }
  .mode:has(input:checked) { border-color: #4a3585; background: #f6f2ff; }
  @media (prefers-reduced-motion: reduce) { .mode input, .mode input::after { transition: none; } }
  .from-bot .tag { display: block; margin-top: 7px; font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: #8a7fa0; }
  .emergency { margin: 0; padding: 10px 14px 13px; font-size: 11.5px; line-height: 1.45; color: #6d6579; background: #f2eef9; }
  @media (prefers-reduced-motion: reduce) { .launcher { transition: none; } }
</style>

<button class="launcher" type="button" aria-label="Открыть помощника центра">
  <span class="dot"></span>Спросить помощника
</button>

<section class="panel" aria-label="Помощник центра">
  <header>
    <div><b>Помощник центра</b><small>Отвечает по открытым страницам сайта</small></div>
    <button type="button" class="close" aria-label="Свернуть">×</button>
  </header>
  <div class="log" role="log" aria-live="polite"></div>
  <div class="quick"></div>
  <label class="mode" hidden>
    <span><b>Свободный ответ</b><small>помощник формулирует сам. Выключите, чтобы увидеть заготовку</small></span>
    <input type="checkbox" role="switch" aria-label="Свободный ответ" checked>
  </label>
  <details class="all">
    <summary><span></span></summary>
    <div class="list"></div>
  </details>
  <form>
    <input type="text" placeholder="Например: свободен ли зал в субботу?" aria-label="Вопрос помощнику" required>
    <button type="button" class="mic" aria-label="Спросить голосом" title="Речь распознаёт браузер: звук обрабатывается его службой распознавания" aria-pressed="false" hidden>🎤</button>
    <button type="submit">Спросить</button>
  </form>
  <p class="emergency">Помощник не оказывает помощи и не распознаёт состояние человека надёжно. При риске для жизни — своей или чужой — звоните 112 или в местные экстренные службы.</p>
</section>
`;

const launcher = root.querySelector(".launcher");
const log = root.querySelector(".log");
const form = root.querySelector("form");
// Именно поле ввода, а не первый input в дереве: переключатель режима стоит
// выше по разметке, и querySelector("input") начал брать его галочку —
// на сервер уходило значение "on" вместо вопроса человека.
const input = root.querySelector('form input[type="text"]');
const quick = root.querySelector(".quick");
let lastSourceKey;

const mode = root.querySelector(".mode");
if (endpoint) {
  mode.hidden = false;
  mode.querySelector("input").addEventListener("change", (event) => { freeMode = event.target.checked; });
}

const say = (text, { who = "bot", kind = "", sources = [], composed = false } = {}) => {
  const node = document.createElement("div");
  node.className = `msg ${who === "user" ? "from-user" : `from-bot ${kind}`}`.trim();
  node.append(document.createTextNode(text));
  for (const source of sources) {
    if (!source) continue;
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = `${source.label} →`;
    node.append(link);
  }
  if (composed) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = "сформулировано моделью по странице центра";
    node.append(tag);
  }
  log.append(node);
  log.scrollTop = log.scrollHeight;
};

let busy = false;

async function send(question) {
  const clean = question.trim();
  if (!clean || busy) return;
  busy = true;
  const submit = root.querySelector("form button");
  submit.disabled = true;
  say(clean, { who: "user" });
  input.value = "";

  // Видимое ожидание вместо тишины: человек должен понимать, что вопрос ушёл.
  const waiting = document.createElement("div");
  waiting.className = "thinking";
  waiting.setAttribute("role", "status");
  waiting.innerHTML = "<i></i>";
  waiting.append(document.createTextNode(freeMode ? "Формулирую ответ…" : "Ищу нужную страницу…"));
  log.append(waiting);
  log.scrollTop = log.scrollHeight;

  // Свой предел ожидания: иначе повисший сервер оставляет панель молчащей.
  const limit = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), freeMode ? 45000 : 15000));

  try {
    const answer = await Promise.race([ask(clean, lastSourceKey), limit]);
    lastSourceKey = answer.sourceKeys?.[0] ?? lastSourceKey;
    say(answer.text, { kind: answer.kind, sources: answer.sources ?? [], composed: Boolean(answer.composed) });
    speak(answer.text);
    spokenAsked = false;
  } catch (error) {
    say(error?.message === "timeout"
      ? "Ответ не пришёл вовремя. Попробуйте ещё раз или откройте нужный раздел на сайте центра."
      : "Помощник сейчас недоступен. Откройте нужный раздел на сайте центра или позвоните администратору.");
  } finally {
    waiting.remove();
    submit.disabled = false;
    busy = false;
  }
}

for (const question of QUICK) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = question;
  button.addEventListener("click", () => void send(question));
  quick.append(button);
}

// Полный набор проверочных вопросов — отдельным раскрытием, а не на виду.
// Категории подписаны намеренно: кризисные сценарии не должны открываться
// случайно на разговоре с центром.
const all = root.querySelector(".all");
const groups = new Map();
for (const item of preparedQuestions) {
  if (!groups.has(item.category)) groups.set(item.category, []);
  groups.get(item.category).push(item.question);
}
root.querySelector(".all summary span").textContent = `Все проверочные вопросы · ${preparedQuestions.length}`;
const list = root.querySelector(".all .list");
for (const [category, questions] of groups) {
  const title = document.createElement("h4");
  title.textContent = category;
  list.append(title);
  for (const question of questions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "q";
    button.textContent = question;
    button.addEventListener("click", () => { all.removeAttribute("open"); void send(question); });
    list.append(button);
  }
}

launcher.addEventListener("click", () => {
  host.setAttribute("open", "");
  input.focus();
});
root.querySelector(".close").addEventListener("click", () => host.removeAttribute("open"));
form.addEventListener("submit", (event) => { event.preventDefault(); void send(input.value); });

// Голос: распознавание речи браузером и озвучивание ответа. Своей логики
// ответа тут нет — тот же путь, что у набранного вопроса.
const Recognition = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;
const mic = root.querySelector(".mic");
let spokenAsked = false;

const speak = (text) => {
  if (!spokenAsked || !("speechSynthesis" in globalThis)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ru-RU";
  speechSynthesis.speak(utterance);
};

if (Recognition) {
  mic.hidden = false;
  const recognition = new Recognition();
  recognition.lang = "ru-RU";
  recognition.interimResults = false;
  let listening = false;
  const stop = () => { listening = false; mic.setAttribute("aria-pressed", "false"); };

  recognition.addEventListener("result", (event) => {
    const heard = event.results[0][0].transcript.trim();
    if (heard) { spokenAsked = true; void send(heard); }
  });
  recognition.addEventListener("error", () => { stop(); say("Не расслышал. Попробуйте ещё раз или наберите вопрос."); });
  recognition.addEventListener("end", stop);

  mic.addEventListener("click", () => {
    if (listening) { recognition.stop(); stop(); return; }
    if ("speechSynthesis" in globalThis) speechSynthesis.cancel();
    listening = true;
    mic.setAttribute("aria-pressed", "true");
    recognition.start();
  });
}

say("Здравствуйте. Спросите про расписание, консультации, обучение, клуб или аренду — покажу нужную страницу центра.");
