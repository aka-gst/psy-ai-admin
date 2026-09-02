import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("hidden login and dashboard states cannot be overridden by form layout", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(css, /\[hidden\]\{display:none!important\}/);
});

test("booking and voice UI keep assets and API calls inside the deployed subpath", async () => {
  const cases = [
    {
      page: "https://aka-gst.ru/psy-admin/booking/",
      html: await readFile(new URL("../public/index.html", import.meta.url), "utf8"),
      script: await readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    },
    {
      page: "https://aka-gst.ru/psy-admin/booking/voice",
      html: await readFile(new URL("../public/voice.html", import.meta.url), "utf8"),
      script: await readFile(new URL("../public/voice.js", import.meta.url), "utf8"),
    },
  ];

  for (const item of cases) {
    const references = [
      ...[...item.html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]),
      ...[...item.script.matchAll(/fetch\(["']([^"']+)["']/g)].map((match) => match[1]),
    ];
    for (const reference of references) {
      const resolved = new URL(reference, item.page);
      assert.ok(
        resolved.pathname.startsWith("/psy-admin/booking/"),
        `${reference} escapes the booking subpath as ${resolved.pathname}`,
      );
    }
  }
});
