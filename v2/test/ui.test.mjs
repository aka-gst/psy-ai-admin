import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("hidden login and dashboard states cannot be overridden by form layout", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(css, /\[hidden\]\{display:none!important\}/);
});
