import "./safe-router.js";
import { createWidgetState, demoHandoffOutcome, reduceWidgetState, routeWidgetQuestion, widgetPresentation } from "./widget-contract.js";

const mount = document.createElement("div");
mount.innerHTML = `
  <section class="psy-widget" data-psy-widget data-open="false" aria-label="Помощник сайта">
    <button class="psy-widget-trigger" type="button" aria-label="Спросить помощника" aria-controls="psy-widget-panel" aria-expanded="false">
      <span aria-hidden="true">✦</span><span>Спросить помощника</span>
    </button>
    <aside class="psy-widget-panel" id="psy-widget-panel" aria-label="AI-администратор" hidden>
      <header class="psy-widget-head">
        <div><b>AI-администратор</b><span>Только открытые источники</span></div>
        <button class="psy-widget-close" type="button" aria-label="Закрыть помощника">×</button>
      </header>
      <p class="psy-widget-boundary">Демо не связано с центром, не хранит переписку и не заменяет психолога, врача или экстренную службу.</p>
      <p class="psy-widget-source-boundary">Ответы ведут только к подтверждённым открытым страницам «Орион-С».</p>
      <div class="psy-widget-messages" aria-live="polite"></div>
      <div class="psy-widget-suggestions" aria-label="Примеры вопросов">
        <button type="button" data-question="Какие мероприятия ближайшие?">Расписание</button>
        <button type="button" data-question="Хочу консультацию онлайн">Консультация онлайн</button>
        <button type="button" data-question="У меня мысли о самоубийстве">Нужна срочная помощь</button>
      </div>
      <form class="psy-widget-form">
        <label class="sr-only" for="psy-widget-question">Вопрос помощнику</label>
        <input id="psy-widget-question" maxlength="500" autocomplete="off" placeholder="Например: где посмотреть расписание?" required>
        <button type="submit">Спросить</button>
      </form>
      <div class="psy-widget-handoff">
        <button class="psy-widget-handoff-open" type="button">Оставить вопрос администратору</button>
        <form class="psy-widget-handoff-form" hidden>
          <p><b>Демо-передача</b><br>Тема и один способ связи нужны только для демонстрации формы. Ничего не отправляется.</p>
          <label>Тема<select required><option value="">Выберите тему</option><option>Консультация</option><option>Мероприятие</option><option>Аренда</option></select></label>
          <label>Как связаться<input maxlength="120" autocomplete="email" placeholder="Телефон или e-mail" required></label>
          <button type="submit">Проверить передачу</button>
          <p class="psy-widget-handoff-status" aria-live="polite"></p>
        </form>
      </div>
    </aside>
  </section>`;
document.body.append(mount);

const root = mount.querySelector("[data-psy-widget]");
const trigger = root.querySelector(".psy-widget-trigger");
const panel = root.querySelector(".psy-widget-panel");
const closeButton = root.querySelector(".psy-widget-close");
const messages = root.querySelector(".psy-widget-messages");
const questionForm = root.querySelector(".psy-widget-form");
const questionInput = root.querySelector("#psy-widget-question");
const handoffOpen = root.querySelector(".psy-widget-handoff-open");
const handoffForm = root.querySelector(".psy-widget-handoff-form");
const handoffStatus = root.querySelector(".psy-widget-handoff-status");
let state = createWidgetState();
let context = {};

function appendMessage(role, text, sources = []) {
  const article = document.createElement("article");
  article.className = `psy-widget-message ${role}`;
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  article.append(paragraph);
  if (sources.length) {
    const links = document.createElement("div");
    links.className = "psy-widget-links";
    for (const source of sources) {
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `${source.label} →`;
      links.append(link);
    }
    article.append(links);
  }
  messages.append(article);
  article.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function render() {
  const presentation = widgetPresentation(window.innerWidth);
  root.dataset.open = String(state.open);
  root.dataset.mode = presentation.mode;
  root.style.setProperty("--psy-widget-touch-target", `${presentation.minTouchTarget}px`);
  panel.hidden = !state.panelVisible;
  trigger.setAttribute("aria-expanded", String(state.open));
  if (state.open) questionInput.focus();
  if (state.returnFocusToTrigger) trigger.focus();
}

function transition(action) {
  state = reduceWidgetState(state, action);
  render();
}

async function ask(question) {
  const value = question.trim();
  if (!value) return;
  appendMessage("user", value);
  const result = routeWidgetQuestion(value, context);
  appendMessage("assistant", result.text, result.sources);
  if (result.sourceKeys?.[0]) context = { lastSourceKey: result.sourceKeys[0] };
  questionInput.value = "";
  questionInput.focus();
}

trigger.addEventListener("click", () => transition("trigger"));
closeButton.addEventListener("click", () => transition("close"));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.open) transition("escape");
});
window.addEventListener("resize", render);
questionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void ask(questionInput.value);
});
root.querySelectorAll("[data-question]").forEach((button) => button.addEventListener("click", () => void ask(button.dataset.question)));
handoffOpen.addEventListener("click", () => {
  handoffOpen.hidden = true;
  handoffForm.hidden = false;
  handoffForm.querySelector("select").focus();
});
handoffForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handoffStatus.textContent = demoHandoffOutcome().message;
  handoffForm.reset();
});

appendMessage("assistant", "Здравствуйте. Помогу найти открытую страницу с расписанием, консультациями, программами, клубом или арендой.");
render();
