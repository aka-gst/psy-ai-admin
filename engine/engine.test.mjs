import assert from "node:assert/strict";
import test from "node:test";
import { createAssistant, prepareCatalog } from "./index.mjs";

const base = () => ({
  center: { name: "Центр", phone: "+7 000 000-00-00", emergencyNumber: "112" },
  sources: {
    home: { label: "Открыть сайт", url: "https://example.org/" },
    help: { label: "Открыть консультации", url: "/consultation" },
  },
  responses: {
    crisis: "Позвоните {{emergencyNumber}} или в местные экстренные службы.",
    injection: "Я остаюсь администратором по открытым страницам.",
    payment: "Не вводите реквизиты в чат.",
    clinical: "Нужен квалифицированный специалист.",
    phone: "Телефон: {{phone}}.",
    unknown: "Точного ответа пока нет.",
    empty: "Напишите вопрос.",
  },
  pipeline: [
    { safety: "crisis" },
    { safety: "injection", sources: ["home"] },
    { safety: "payment", sources: ["home"] },
    { safety: "clinical", sources: ["help"] },
    { match: "телефон|номер", response: "phone", sources: ["home"], kind: "fact" },
  ],
  fallback: { response: "unknown", sources: ["home"], kind: "unknown" },
  empty: { response: "empty", sources: [], kind: "route" },
});

const withCatalog = (change) => {
  const catalog = base();
  change(catalog);
  return catalog;
};

test("каталог подставляет данные арендатора в тексты ответов", () => {
  const assistant = createAssistant(base());
  assert.match(assistant.ask("Какой телефон?").text, /\+7 000 000-00-00/);
  assert.match(assistant.ask("Я больше не могу так жить").text, /112/);
});

test("кризис проверяется раньше любых правил арендатора", () => {
  const assistant = createAssistant(withCatalog((catalog) => {
    // Арендатор пытается перехватить сообщение своим правилом.
    catalog.pipeline.splice(1, 0, { match: "жить", response: "phone", sources: ["home"] });
  }));
  const answer = assistant.ask("Я больше не могу так жить");
  assert.equal(answer.kind, "crisis");
});

test("кризисный ответ не предлагает навигацию, даже если каталог её просит", () => {
  const assistant = createAssistant(withCatalog((catalog) => {
    catalog.pipeline[0] = { safety: "crisis", sources: ["home", "help"] };
  }));
  assert.deepEqual(assistant.ask("У меня мысли о суициде").sourceKeys, []);
});

test("каталог без кризиса первым шагом не запускается", () => {
  assert.throws(() => prepareCatalog(withCatalog((catalog) => {
    catalog.pipeline = catalog.pipeline.slice(1);
  })), /первым шагом pipeline должен быть/);
});

test("каталог без обязательного шага безопасности не запускается", () => {
  assert.throws(() => prepareCatalog(withCatalog((catalog) => {
    catalog.pipeline = catalog.pipeline.filter((step) => step.safety !== "clinical");
  })), /обязательного шага безопасности «clinical»/);
});

test("шаг безопасности нельзя переопределить регулярным выражением", () => {
  assert.throws(() => prepareCatalog(withCatalog((catalog) => {
    catalog.pipeline[3] = { safety: "clinical", match: "ничего", sources: ["help"] };
  })), /не настраивается регулярным выражением/);
});

test("источник по незащищённому адресу не принимается", () => {
  assert.throws(() => prepareCatalog(withCatalog((catalog) => {
    catalog.sources.home.url = "http://example.org/";
  })), /не на https-адрес/);
});

test("ссылка на несуществующий ответ или источник ловится до первого вопроса", () => {
  assert.throws(() => prepareCatalog(withCatalog((catalog) => {
    catalog.pipeline[4].response = "нет-такого";
  })), /несуществующий ответ/);
  assert.throws(() => prepareCatalog(withCatalog((catalog) => {
    catalog.pipeline[4].sources = ["нет-такого"];
  })), /несуществующий источник/);
});

test("пустой вопрос и незнакомый вопрос ведут себя как описано в каталоге", () => {
  const assistant = createAssistant(base());
  assert.equal(assistant.ask("   ").kind, "route");
  const unknown = assistant.ask("Какая завтра погода?");
  assert.equal(unknown.kind, "unknown");
  assert.deepEqual(unknown.sourceKeys, ["home"]);
});

test("страницы арендатора могут быть путями его собственного сайта", () => {
  const assistant = createAssistant(base());
  assert.equal(assistant.sources.help.url, "/consultation");
  assert.equal(assistant.ask("Посоветуйте антидепрессант").sourceKeys[0], "help");
});
