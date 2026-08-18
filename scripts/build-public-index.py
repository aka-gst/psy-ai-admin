#!/usr/bin/env python3
"""Создаёт локальный поисковый индекс из разрешённого публичного снимка."""

from html.parser import HTMLParser
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "reference" / "orion-center-public-snapshot"
OUTPUT = ROOT / "demo" / "public-content-index.js"
PAGES = {
    "index.html": ("https://orion-center.ru/", "Главная"),
    "schedule.html": ("https://orion-center.ru/schedule", "Расписание"),
    "psycluborion.html": ("https://orion-center.ru/psycluborion", "Психологический клуб"),
    "pweducation.html": ("https://orion-center.ru/pweducation", "ProcessWork и обучение"),
    "consultation.html": ("https://orion-center.ru/consultation", "Консультации"),
    "services.html": ("https://orion-center.ru/services", "Аренда залов"),
    "programs.html": ("https://orion-center.ru/programs", "Программы"),
}

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(); self.skip = 0; self.parts = []
    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript", "svg"}: self.skip += 1
    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript", "svg"} and self.skip: self.skip -= 1
    def handle_data(self, data):
        cleaned = " ".join(data.split())
        if cleaned and not self.skip: self.parts.append(cleaned)

documents = []
for filename, (url, title) in PAGES.items():
    parser = TextExtractor()
    parser.feed((SNAPSHOT / filename).read_text(encoding="utf-8"))
    text = " ".join(parser.parts)
    documents.append({"url": url, "title": title, "summary": text[:280], "text": text[:30000]})
OUTPUT.write_text("// Generated from the local public snapshot; do not commit.\n" + f"globalThis.publicContentIndex = {json.dumps(documents, ensure_ascii=False)};\n", encoding="utf-8")
print(f"Wrote {len(documents)} documents to {OUTPUT.relative_to(ROOT)}")
