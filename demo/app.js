const form = document.querySelector("#chat-form");
const input = document.querySelector("#question");
const messages = document.querySelector("#messages");
const handoffOpen = document.querySelector("#handoff-open");
const handoffForm = document.querySelector("#handoff-form");
const handoffStatus = document.querySelector("#handoff-status");
const assistantChoice = document.querySelector("#assistant-choice");
const adminChoice = document.querySelector("#admin-choice");
const resetChat = document.querySelector("#reset-chat");
let conversationContext = {};

function initialMessage() {
  const article = document.createElement("article");
  article.className = "message assistant";
  const text = document.createElement("p");
  text.textContent = "Здравствуйте. Могу помочь найти открытую страницу с программами, расписанием, консультациями, клубом или арендой. О чём хотите узнать?";
  article.append(text);
  return article;
}

function appendMessage(role, content, sources = [], excerpt = null) {
  const article = document.createElement("article");
  article.className = `message ${role}`;
  const text = document.createElement("p");
  text.textContent = content;
  article.append(text);
  if (excerpt) {
    const snippet = document.createElement("p");
    snippet.className = "snippet";
    snippet.textContent = excerpt.length === 0 ? null : `«${excerpt}…»`;
    article.append(snippet);
  }
  if (sources.length) {
    const refs = document.createElement("div");
    refs.className = "links";
    sources.forEach((source) => {
      const a = document.createElement("a");
      a.className = "link-card";
      a.href = source.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      const title = document.createElement("strong");
      title.textContent = `${source.label} →`;
      const description = document.createElement("span");
      description.textContent = source.description;
      a.append(title, description);
      refs.append(a);
    });
    article.append(refs);
  }
  messages.append(article);
  article.scrollIntoView({ behavior: "smooth", block: "end" });
}

function submitQuestion(value) {
  const q = value.trim();
  if (!q) return;
  appendMessage("user", q);
  const result = globalThis.routeQuestion(q, conversationContext);
  appendMessage("assistant", result.text, result.sources, result.excerpt);
  if (result.sourceKeys?.length) conversationContext = { lastSourceKey: result.sourceKeys[0] };
  input.value = "";
  input.focus();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitQuestion(input.value);
});
document.querySelectorAll("[data-question]").forEach((button) => {
  button.addEventListener("click", () => submitQuestion(button.dataset.question));
});

function showHandoff() {
  handoffForm.hidden = false;
  handoffOpen.hidden = true;
  handoffForm.scrollIntoView({ behavior: "smooth", block: "center" });
  handoffForm.querySelector("select").focus();
}

handoffOpen.addEventListener("click", showHandoff);
adminChoice.addEventListener("click", showHandoff);
assistantChoice.addEventListener("click", () => {
  input.scrollIntoView({ behavior: "smooth", block: "center" });
  input.focus();
});

handoffForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handoffStatus.textContent = "В демо заявка остаётся только в этой форме и никуда не передаётся.";
  handoffForm.reset();
});

resetChat.addEventListener("click", () => {
  conversationContext = {};
  messages.replaceChildren(initialMessage());
  input.value = "";
  handoffForm.reset();
  handoffForm.hidden = true;
  handoffOpen.hidden = false;
  handoffStatus.textContent = "";
  input.focus();
});
