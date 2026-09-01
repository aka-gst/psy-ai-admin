#!/usr/bin/env node
// Показ виджета поверх настоящих страниц центра.
//
// Сервер отдаёт сохранённый публичный снимок orion-center.ru и вставляет в
// каждую страницу одну строку со скриптом виджета — ровно так, как это
// выглядело бы у них на сайте. Ничего не публикуется и не устанавливается:
// снимок локальный, страницы отдаются с этой машины.
//
//   node scripts/demo-widget.mjs                       — движок считает в браузере
//   node scripts/demo-widget.mjs --endpoint http://127.0.0.1:4180/api/ask
//                                                      — ответы от v2 с моделью
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const snapshot = join(root, "reference/orion-center-public-snapshot");

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : ""; };
const endpoint = flag("endpoint");
const port = Number(flag("port") || 4700);

// Ключ — путь на их сайте, значение — файл снимка.
const PAGES = {
  "/": "index.html",
  "/schedule": "schedule.html",
  "/psycluborion": "psycluborion.html",
  "/pweducation": "pweducation.html",
  "/consultation": "consultation.html",
  "/services": "services.html",
  "/programs": "programs.html",
};

const MIME = { ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };

const inject = (html) => {
  const tag = `<script type="module" data-psy-widget src="/__widget/psy-widget.js" data-endpoint="/api/ask"></script>`;
  return html.includes("</body>") ? html.replace("</body>", `${tag}</body>`) : html + tag;
};

// Помощник проксируется через тот же адрес, что и страницы. Тогда публичная
// ссылка одна, и браузеру посетителя не нужно ходить на localhost.
// Проксируются РОВНО три маршрута помощника: панель менеджера и всё
// остальное наружу не выходит.
const PROXY = new Set(["/api/ask", "/api/chat", "/api/config"]);
const upstream = flag("upstream") || "http://127.0.0.1:4180";

const proxy = async (request, response, pathname) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  try {
    const answer = await fetch(`${upstream}${pathname}`, {
      method: request.method,
      headers: { "content-type": request.headers["content-type"] ?? "application/json" },
      body: request.method === "GET" ? undefined : body,
    });
    const text = await answer.text();
    response.writeHead(answer.status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(text);
  } catch {
    response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Помощник сейчас недоступен." }));
  }
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const send = (status, type, body) => {
    response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
    response.end(body);
  };

  if (PROXY.has(url.pathname)) return proxy(request, response, url.pathname);

  // Файлы виджета и движка отдаются из репозитория как есть.
  if (url.pathname.startsWith("/__widget/") || url.pathname.startsWith("/engine/") || url.pathname.startsWith("/hosted-demo/")) {
    const relative = normalize(url.pathname.replace("/__widget/", "widget/")).replace(/^(\.\.[/\\])+/, "");
    try {
      const file = await readFile(join(root, relative));
      return send(200, MIME[extname(relative)] ?? "application/octet-stream", file);
    } catch {
      return send(404, "text/plain; charset=utf-8", "нет такого файла");
    }
  }

  const page = PAGES[url.pathname] ?? PAGES[url.pathname.replace(/\/$/, "")];
  if (!page) return send(404, "text/html; charset=utf-8", `<p>Страницы нет в снимке. Доступны: ${Object.keys(PAGES).join(", ")}</p>`);
  try {
    return send(200, "text/html; charset=utf-8", inject(await readFile(join(snapshot, page), "utf8")));
  } catch {
    return send(500, "text/plain; charset=utf-8", "снимок не найден: reference/orion-center-public-snapshot");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Показ виджета: http://127.0.0.1:${port}/`);
  console.log(`Ответы: через ${upstream} (проксируются только /api/ask, /api/chat, /api/config)`);
  console.log(`Страницы: ${Object.keys(PAGES).join("  ")}`);
});
