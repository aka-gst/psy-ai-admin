const form = document.querySelector("#chat-form");
const input = document.querySelector("#question");
const messages = document.querySelector("#messages");

function appendMessage(role, content, sources = []) {
  const article = document.createElement("article");
  article.className = `message ${role}`;
  const text = document.createElement("p");
  text.textContent = content;
  article.append(text);
  if (sources.length) {
    const refs = document.createElement("p");
    refs.className = "sources";
    refs.append("Источник: ");
    sources.forEach((source, index) => {
      const a = document.createElement("a");
      a.href = source.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = source.label;
      refs.append(a);
      if (index < sources.length - 1) refs.append(" · ");
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
  const result = globalThis.routeQuestion(q);
  appendMessage("assistant", result.text, result.sources);
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
