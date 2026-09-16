import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("60 проверочных вопросов остаются компактным выпадающим списком", async () => {
  const source = await readFile(new URL("./psy-widget.js", import.meta.url), "utf8");

  assert.match(source, /<select id="psy-prepared-question"/);
  assert.match(source, /document\.createElement\("optgroup"\)/);
  assert.match(source, /preparedSelect\.addEventListener\("change"/);
  assert.doesNotMatch(source, /<details class="all">/);
});

test("виджет даёт прямой переход в форму записи Psy Admin", async () => {
  const source = await readFile(new URL("./psy-widget.js", import.meta.url), "utf8");

  assert.match(source, /const bookingUrl = script\?\.dataset\?\.bookingUrl \?\? "\/psy-admin\/booking\/"/);
  assert.match(source, /Записаться к специалисту/);
  assert.match(source, /href="\$\{bookingUrl\}"/);
});
