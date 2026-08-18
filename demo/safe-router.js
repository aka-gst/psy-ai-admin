const SOURCES = {
  schedule: { label: "Расписание «Орион-С»", url: "https://orion-center.ru/schedule", dynamic: true },
  consultation: { label: "Индивидуальные консультации", url: "https://orion-center.ru/consultation", dynamic: false },
  club: { label: "Психологический клуб", url: "https://orion-center.ru/psycluborion", dynamic: true },
  education: { label: "Центр ProcessWork", url: "https://orion-center.ru/pweducation", dynamic: false },
  rental: { label: "Аренда залов", url: "https://orion-center.ru/services", dynamic: true },
  programs: { label: "Программы центра", url: "https://orion-center.ru/programs", dynamic: false },
  home: { label: "Официальный сайт «Орион-С»", url: "https://orion-center.ru/", dynamic: false }
};

const crisis = /самоуб|суицид|убить себя|покончить с собой|причинить.*себе|не хочу жить|навредить.*(себе|друг)/i;
const clinical = /диагноз|паническ|тревог|депрес|антидепресс|лекарств|таблетк|травм|лечи(ть|те)|терапи|упражнен/i;
const payment = /карт[аы]|реквизит|cvv|парол|личн(ый|ого) кабинет|оплатить.*чат/i;
const injection = /игнорируй|обойди.*правил|системн(ые|ые инструкции)|раскрой.*инструкц/i;

function answer(text, sources = [], kind = "route") {
  return { kind, text, sources: sources.map((key) => SOURCES[key]) };
}

function routeQuestion(input) {
  const q = input.trim();
  if (!q) return answer("Напишите, пожалуйста, вопрос о программах, расписании, консультациях, клубе или аренде.");
  if (crisis.test(q)) {
    return answer("Если есть риск причинить вред себе или кому-то, пожалуйста, прямо сейчас позвоните в местные экстренные службы или обратитесь к близкому человеку рядом. Для связи с центром — официальный сайт по ссылке ниже.", ["home"], "crisis");
  }
  if (injection.test(q)) return answer("Вот открытые разделы центра: программы, расписание, консультации, клуб и аренда.", ["home"], "route");
  if (payment.test(q)) return answer("Оплата и личный кабинет доступны только на официальном сайте центра. Откройте ссылку ниже и выберите нужный раздел.", ["home"], "route");
  if (clinical.test(q)) return answer("Для выбора формата профессиональной консультации откройте страницу консультаций. При немедленной опасности обратитесь в экстренные службы.", ["consultation"], "route");
  if (/распис|мероприят|ближайш|когда|дата|мест[ао]/i.test(q)) return answer("Актуальные даты, формат и регистрация находятся в официальном расписании. Откройте страницу ниже.", ["schedule"], "route");
  if (/клуб|вечер с польз/i.test(q)) return answer("Описание клуба, ближайшие встречи и регистрация находятся на странице клуба.", ["club"], "route");
  if (/аренд|зал|кабинет|тренинг.*мест/i.test(q)) return answer("Площадки, оборудование и способ оставить запрос на аренду — на странице аренды.", ["rental"], "route");
  if (/process|процесс|обуч|учиться|программ/i.test(q)) return answer("Здесь собраны программы ProcessWork и форматы обучения. Выберите интересующее направление на страницах ниже.", ["education", "programs"], "route");
  if (/консультац|психолог|онлайн|специалист|реб[её]нк/i.test(q)) return answer("На этой странице описаны форматы индивидуальных консультаций и специалисты центра.", ["consultation"], "route");
  if (/адрес|телефон|почт|контакт|где вы/i.test(q)) return answer("Адрес, телефон и e-mail опубликованы на официальном сайте центра.", ["home"], "route");
  return answer("Вот официальный сайт центра: там можно перейти к программам, расписанию, консультациям, клубу и аренде.", ["home"], "route");
}

// Работает при локальном открытии HTML-файла и в будущей серверной обёртке.
globalThis.routeQuestion = routeQuestion;
