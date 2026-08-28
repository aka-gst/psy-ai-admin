import { responses } from "./content.js";
import { isClinical, isCrisis } from "./safety-signals.js";
export { preparedQuestions, sources } from "./content.js";

const payment = /карт[аы]|реквизит|cvv|парол|личн(ый|ого) кабинет|оплатить.*чат|как оплатить|оплат[аы].*участ/i;
const injection = /игнорируй|обойди.*правил|системн(ые|ые инструкции)|раскрой.*инструкц/i;

const result = (text, sourceKeys = [], kind = "route") => ({ text, sourceKeys, kind });

export function routeQuestion(input, lastSourceKey) {
  const q = input.trim();
  if (!q) return result(responses.empty);
  if (isCrisis(q)) return result(responses.crisis, [], "crisis");
  if (injection.test(q)) return result(responses.injection, ["home"], "boundary");
  if (/вернут|возврат|оферт|услови.*оплат/i.test(q)) return result(responses.refund, ["offer"]);
  if (/храните|переписк|конфиденциальн|персональн.*данн|политик/i.test(q)) return result(responses.privacy, ["policy"]);
  if (payment.test(q)) return result(responses.payment, ["home"], "boundary");
  if (isClinical(q)) return result(responses.clinical, ["consultation"], "boundary");
  if (/гарантир|обеща.*результат|точно поможет/i.test(q)) return result(responses.guarantee, ["consultation"], "boundary");
  if (/адрес|где (?:вы|наход)|как добрат|метро/i.test(q)) return result(responses.address, ["home"], "fact");
  if (/^она онлайн|^она очно|онлайн или очно/i.test(q)) return result(responses.eventFormat, ["schedule"]);
  if (lastSourceKey && /^(она|он|они|там|эт[ао]|сколько|когда|формат|очно|онлайн|стоимость|цена|регистрац)/i.test(q)) return result(responses.context, [lastSourceKey], "context");
  if (/распис|мероприят|ближайш|когда|дата|мест[ао]|семинар/i.test(q)) return result(responses.schedule, ["schedule"]);
  if (/клуб|вечер с польз/i.test(q)) return result(responses.club, ["club"]);
  if (/аренд|зал|кабинет|тренинг.*мест/i.test(q)) return result(responses.rental, ["rental"]);
  if (/process|процесс|обуч|учиться|программ|образован|документ|диплом|сертифик/i.test(q)) return result(responses.education, ["education", "programs"]);
  if (/консультац|(?:^|[^а-яё])психолог|онлайн|специалист|реб[её]нк|дет(?:и|ей|ьми)/i.test(q)) return result(responses.consultation, ["consultation"]);
  if (/записа|заявк|хочу прийти|забронировать/i.test(q)) return result(responses.booking, ["home"]);
  if (/телефон|позвонить|номер/i.test(q)) return result(responses.phone, ["home"], "fact");
  if (/почт|e-?mail|написать/i.test(q)) return result(responses.email, ["home"], "fact");
  if (/контакт/i.test(q)) return result(responses.contacts, ["home"], "fact");
  return result(responses.unknown, ["home"], "unknown");
}
