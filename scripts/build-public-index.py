#!/usr/bin/env python3
"""Создаёт локальный поисковый индекс из разрешённого публичного снимка.

Готовит раздел documents для каталога арендатора: движок ищет по нему, когда
коротких описаний about не хватает. Результат не коммитится — это производный
артефакт из локального снимка открытых страниц.
"""

from html.parser import HTMLParser
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "reference" / "orion-center-public-snapshot"
OUTPUT = ROOT / "data" / "private" / "documents.json"
# Ключи совпадают с sources в каталоге арендатора.
PAGES = {
    "index.html": "home",
    "schedule.html": "schedule",
    "psycluborion.html": "club",
    "pweducation.html": "education",
    "consultation.html": "consultation",
    "services.html": "rental",
    "programs.html": "programs",
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

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
documents = []
for filename, source in PAGES.items():
    parser = TextExtractor()
    parser.feed((SNAPSHOT / filename).read_text(encoding="utf-8"))
    documents.append({"source": source, "text": " ".join(parser.parts)[:20000]})
OUTPUT.write_text(json.dumps(documents, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {len(documents)} documents to {OUTPUT.relative_to(ROOT)}")
print("Вставьте содержимое в раздел documents каталога арендатора.")
