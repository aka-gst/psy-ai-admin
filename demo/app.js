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
