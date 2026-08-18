#!/usr/bin/env python3
"""Локальный сервер демо с проверкой динамических публичных страниц по запросу."""

from datetime import datetime, timezone
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen
import json

ROOT = Path(__file__).resolve().parent
DEMO = ROOT / "demo"
LIVE_PAGES = {
    "schedule": "https://orion-center.ru/schedule",
    "club": "https://orion-center.ru/psycluborion",
    "rental": "https://orion-center.ru/services",
}


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript", "svg"}:
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript", "svg"} and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        text = " ".join(data.split())
        if text and not self.skip:
            self.parts.append(text)


class DemoHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DEMO), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/live":
            return super().do_GET()
        topic = parse_qs(parsed.query).get("topic", [""])[0]
        url = LIVE_PAGES.get(topic)
        if not url:
            self.send_error(400, "Unknown public topic")
            return
        try:
            request = Request(url, headers={"User-Agent": "PsyAIAdminDemo/0.1 (+local-demo)"})
            with urlopen(request, timeout=12) as response:
                html = response.read(750_000).decode("utf-8", errors="replace")
            parser = VisibleText()
            parser.feed(html)
            payload = {
                "topic": topic,
                "url": url,
                "checkedAt": datetime.now(timezone.utc).isoformat(),
                "text": " ".join(parser.parts)[:60_000],
            }
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception:
            self.send_error(502, "Public page is temporarily unavailable")


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 4173), DemoHandler).serve_forever()
