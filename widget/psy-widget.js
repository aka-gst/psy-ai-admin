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

const script = document.currentScript ?? document.querySelector("script[data-psy-widget]");
const endpoint = script?.dataset?.endpoint ?? "";
const local = createAssistant(catalog);

const QUICK = [
  "Свободен ли зал в субботу?",
  "Ближайшие мероприятия",
  "Хочу консультацию онлайн",
];

const ask = async (question, lastSourceKey) => {
  if (!endpoint) {
    const answer = await local.ask(question, lastSourceKey);
    return { ...answer, sources: answer.sourceKeys.map((key) => local.sources[key]) };
  }
  const response = await fetch(endpoint, {
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
  .quick { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 10px; background: #f7f5fb; }
  .quick button { padding: 7px 11px; border: 1px solid #cdbfe8; border-radius: 999px; background: #fff; color: #45327a; font-size: 12.5px; cursor: pointer; }
  .quick button:hover { border-color: #7d5fc6; }
  form { display: flex; gap: 8px; padding: 12px 14px; border-top: 1px solid #e6e1ef; }
  input { flex: 1; min-width: 0; min-height: 42px; padding: 0 12px; border: 1px solid #d2c9e2; border-radius: 10px; font-size: 14.5px; }
  input:focus { outline: 2px solid #7452bd; outline-offset: -1px; }
  form button { min-height: 42px; padding: 0 16px; border: 0; border-radius: 10px; background: #4a3585; color: #fff; font-weight: 600; cursor: pointer; }
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
  <form>
    <input type="text" placeholder="Например: свободен ли зал в субботу?" aria-label="Вопрос помощнику" required>
    <button type="submit">Спросить</button>
  </form>
  <p class="emergency">Помощник не оказывает помощи и не распознаёт состояние человека надёжно. При риске для жизни — своей или чужой — звоните 112 или в местные экстренные службы.</p>
</section>
`;

const launcher = root.querySelector(".launcher");
const log = root.querySelector(".log");
const form = root.querySelector("form");
const input = root.querySelector("input");
const quick = root.querySelector(".quick");
let lastSourceKey;

const say = (text, { who = "bot", kind = "", sources = [] } = {}) => {
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
  log.append(node);
  log.scrollTop = log.scrollHeight;
};

async function send(question) {
  const clean = question.trim();
  if (!clean) return;
  say(clean, { who: "user" });
  input.value = "";
  try {
    const answer = await ask(clean, lastSourceKey);
    lastSourceKey = answer.sourceKeys?.[0] ?? lastSourceKey;
    say(answer.text, { kind: answer.kind, sources: answer.sources ?? [] });
  } catch {
    say("Не удалось получить ответ. Откройте нужный раздел на сайте центра или позвоните администратору.");
  }
}

for (const question of QUICK) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = question;
  button.addEventListener("click", () => void send(question));
  quick.append(button);
}

launcher.addEventListener("click", () => {
  host.setAttribute("open", "");
  input.focus();
});
root.querySelector(".close").addEventListener("click", () => host.removeAttribute("open"));
form.addEventListener("submit", (event) => { event.preventDefault(); void send(input.value); });

say("Здравствуйте. Спросите про расписание, консультации, обучение, клуб или аренду — покажу нужную страницу центра.");
