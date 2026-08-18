const SOURCES = {
  schedule: {
    label: "Открыть расписание",
    title: "Расписание «Орион-С»",
    description: "Мероприятия, даты, формат и регистрация",
    url: "https://orion-center.ru/schedule",
    snapshot: "../reference/orion-center-public-snapshot/schedule.html",
    dynamic: true
  },
  consultation: {
    label: "Открыть консультации",
    title: "Индивидуальные консультации",
    description: "Форматы консультаций и специалисты центра",
    url: "https://orion-center.ru/consultation",
    snapshot: "../reference/orion-center-public-snapshot/consultation.html",
    dynamic: false
  },
  club: {
    label: "Открыть страницу клуба",
    title: "Психологический клуб",
    description: "Встречи клуба и регистрация",
    url: "https://orion-center.ru/psycluborion",
    snapshot: "../reference/orion-center-public-snapshot/psycluborion.html",
    dynamic: true
  },
  education: {
    label: "Открыть ProcessWork",
    title: "Центр ProcessWork",
    description: "Направление и образовательные форматы",
    url: "https://orion-center.ru/pweducation",
    snapshot: "../reference/orion-center-public-snapshot/pweducation.html",
    dynamic: false
  },
  rental: {
    label: "Открыть аренду залов",
    title: "Аренда залов",
    description: "Помещения, оборудование и запрос на аренду",
    url: "https://orion-center.ru/services",
    snapshot: "../reference/orion-center-public-snapshot/services.html",
    dynamic: true
  },
  programs: {
    label: "Открыть все программы",
    title: "Программы центра",
    description: "Обучение, семинары и другие направления",
    url: "https://orion-center.ru/programs",
    snapshot: "../reference/orion-center-public-snapshot/programs.html",
    dynamic: false
  },
  home: {
    label: "Открыть сайт «Орион-С»",
    title: "Официальный сайт «Орион-С»",
    description: "Контакты и все открытые разделы центра",
    url: "https://orion-center.ru/",
    snapshot: "../reference/orion-center-public-snapshot/index.html",
    dynamic: false
  },
  policy: {
    label: "Открыть политику конфиденциальности",
    title: "Политика конфиденциальности",
    description: "Официальные правила обработки данных",
    url: "https://orion-center.ru/privacy",
    snapshot: "../reference/orion-center-public-snapshot/index.html",
    dynamic: false
  },
  offer: {
    label: "Открыть публичную оферту",
    title: "Публичная оферта",
    description: "Официальные условия оплаты и возврата",
    url: "https://orion-center.ru/publicoferta",
    snapshot: "../reference/orion-center-public-snapshot/index.html",
    dynamic: false
  }
};

const crisis = /самоуб|суицид|убить себя|покончить с собой|причинить.*себе|не хочу жить|навредить.*(себе|друг)/i;
const clinical = /диагноз|паническ|тревог|депрес|антидепресс|лекарств|таблетк|травм|лечи(ть|те)|терапи|упражнен/i;
const payment = /карт[аы]|реквизит|cvv|парол|личн(ый|ого) кабинет|оплатить.*чат/i;
const injection = /игнорируй|обойди.*правил|системн(ые|ые инструкции)|раскрой.*инструкц/i;
const stopWords = new Set(["и", "в", "на", "что", "как", "для", "это", "мне", "про", "или", "есть", "хочу", "можно", "ли", "у", "по", "с", "а", "к", "от"]);

function answer(text, sourceKeys = [], kind = "route", excerpt = null) {
  return { kind, text, sourceKeys, sources: sourceKeys.map((key) => SOURCES[key]), excerpt };
}

function sourceKeyByUrl(url) {
  return Object.keys(SOURCES).find((key) => SOURCES[key].url === url);
}

function searchPublicContent(query) {
  const tokens = query.toLowerCase().match(/[а-яёa-z]{3,}/g)?.filter((word) => !stopWords.has(word)) ?? [];
  if (!tokens.length || !Array.isArray(globalThis.publicContentIndex)) return null;
  const ranked = globalThis.publicContentIndex
    .map((document) => {
      const text = document.text.toLowerCase();
      const score = tokens.reduce((total, token) => total + (text.split(token).length - 1), 0);
      return { document, score };
    })
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 2) return null;
  const sourceKey = sourceKeyByUrl(best.document.url);
  const firstMatch = tokens.map((token) => best.document.text.toLowerCase().indexOf(token)).find((index) => index >= 0) ?? 0;
  const excerpt = best.document.text.slice(Math.max(0, firstMatch - 90), firstMatch + 240).replace(/\s+/g, " ").trim();
  return sourceKey ? { sourceKey, title: best.document.title, excerpt } : null;
}

function routeQuestion(input, context = {}) {
  const q = input.trim();
  if (!q) return answer("Напишите, пожалуйста, вопрос о программах, расписании, консультациях, клубе или аренде.");
  if (crisis.test(q)) {
    return answer("Если есть риск причинить вред себе или кому-то, пожалуйста, прямо сейчас позвоните в местные экстренные службы или обратитесь к близкому человеку рядом. Для связи с центром — официальный сайт по ссылке ниже.", ["home"], "crisis");
  }
  if (injection.test(q)) return answer("Вот открытые разделы центра: программы, расписание, консультации, клуб и аренда.", ["home"], "route");
  if (/вернут|возврат|оферт|услови.*оплат/i.test(q)) return answer("Условия оплаты и возврата опубликованы в публичной оферте.", ["offer"], "route");
  if (/храните|переписк|конфиденциальн|персональн.*данн|политик/i.test(q)) return answer("Правила обработки данных опубликованы в политике конфиденциальности.", ["policy"], "route");
  if (payment.test(q)) return answer("Оплата и личный кабинет доступны только на официальном сайте центра. Откройте ссылку ниже и выберите нужный раздел.", ["home"], "route");
  if (clinical.test(q)) return answer("Для выбора формата профессиональной консультации откройте страницу консультаций. При немедленной опасности обратитесь в экстренные службы.", ["consultation"], "route");
  if (/гарантир|обеща.*результат|точно поможет/i.test(q)) return answer("Форматы консультаций и способы связаться с центром описаны на странице ниже.", ["consultation"], "route");
  if (context.lastSourceKey && /^(она|он|они|там|эт[ао]|сколько|когда|формат|очно|онлайн|стоимость|цена|регистрац)/i.test(q)) {
    const source = SOURCES[context.lastSourceKey];
    if (source) return answer(`Продолжаем про «${source.title}». Актуальные детали смотрите на странице ниже.`, [context.lastSourceKey], "context");
  }
  if (/она онлайн|она очно|онлайн или очно/i.test(q)) return answer("Формат мероприятия указан в официальном расписании. Откройте страницу ниже.", ["schedule"], "route");
  if (/распис|мероприят|ближайш|когда|дата|мест[ао]/i.test(q)) return answer("Актуальные даты, формат и регистрация находятся в официальном расписании. Откройте страницу ниже.", ["schedule"], "route");
  if (/клуб|вечер с польз/i.test(q)) return answer("Описание клуба, ближайшие встречи и регистрация находятся на странице клуба.", ["club"], "route");
  if (/аренд|зал|кабинет|тренинг.*мест/i.test(q)) return answer("Площадки, оборудование и способ оставить запрос на аренду — на странице аренды.", ["rental"], "route");
  if (/process|процесс|обуч|учиться|программ|документ.*образован|диплом|сертифик/i.test(q)) return answer("Здесь собраны программы ProcessWork и форматы обучения. Выберите интересующее направление на страницах ниже.", ["education", "programs"], "route");
  if (/консультац|(?:^|[^а-яё])психолог|онлайн|специалист|реб[её]нк/i.test(q)) return answer("На этой странице описаны форматы индивидуальных консультаций и специалисты центра.", ["consultation"], "route");
  if (/записа|заявк|хочу прийти|забронировать/i.test(q)) return answer("Выберите подходящую услугу или мероприятие на официальном сайте центра: на странице есть актуальный способ записи.", ["home"], "route");
  if (/адрес|где вы/i.test(q)) return answer("Центр указан по адресу: Санкт-Петербург, Боткинская ул., д. 1, к. 4А, рядом с м. «Площадь Ленина».", ["home"], "fact");
  if (/телефон|позвонить|номер/i.test(q)) return answer("Телефон центра: +7 (911) 970-97-27.", ["home"], "fact");
  if (/почт|e-?mail|написать/i.test(q)) return answer("E-mail центра: info@orion-center.ru и orion-c@list.ru.", ["home"], "fact");
  if (/контакт/i.test(q)) return answer("Центр: Санкт-Петербург, Боткинская ул., д. 1, к. 4А; телефон +7 (911) 970-97-27; e-mail info@orion-center.ru.", ["home"], "fact");
  const searchResult = searchPublicContent(q);
  if (searchResult) return answer(`Подобрал наиболее подходящую страницу: «${searchResult.title}».`, [searchResult.sourceKey], "search", searchResult.excerpt);
  return answer("Вот официальный сайт центра: там можно перейти к программам, расписанию, консультациям, клубу и аренде.", ["home"], "route");
}

// Работает при локальном открытии HTML-файла и в будущей серверной обёртке.
globalThis.routeQuestion = routeQuestion;
