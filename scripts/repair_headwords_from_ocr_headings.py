#!/usr/bin/env python3
"""Repair damaged webapp headword fields from OCR markdown headings."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OCR_PATH = ROOT / "raw_data" / "dictionary.OCR.md"
DATA_PATH = ROOT / "webapp" / "data.json"

ENTRY_RE = re.compile(r"^(?:#{2,6}\s*)?(?:\*\s*)?(?P<id>\d{1,4})\.?\s+(?P<title>.+?)\s*$")
HAN_RE = re.compile(r"[\u3400-\u9fff]")


def ocr_headings() -> dict[int, str]:
    headings: dict[int, str] = {}
    current_id = 0
    for raw_line in OCR_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        match = ENTRY_RE.match(line)
        if not match:
            continue
        entry_id = int(match.group("id"))
        has_marker = line.startswith("##")
        is_next_unmarked = current_id and entry_id == current_id + 1
        if 1 <= entry_id <= 8291 and (has_marker or is_next_unmarked):
            headings[entry_id] = match.group("title").strip()
            current_id = entry_id
    return headings


def split_title(title: str) -> tuple[str, str]:
    match = HAN_RE.search(title)
    if not match:
        return title.strip(), ""
    return title[: match.start()].strip(), title[match.start() :].strip()


def should_repair(record: dict, title: str) -> bool:
    if not title:
        return False
    if not record.get("headword_pinyin_best"):
        return True
    issues = " ".join(record.get("issues", []))
    return "headword_chinese" in issues or "headword_ocr" in issues or "corrupt_headword" in issues


def main() -> None:
    headings = ocr_headings()
    rows = [
        json.loads(line)
        for line in DATA_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]

    changed = 0
    for record in rows:
        title = headings.get(record["id"], "")
        if not should_repair(record, title):
            continue

        romanized, chinese = split_title(title)
        before = (
            record.get("headword_raw_best"),
            record.get("headword_romanized_best"),
            record.get("headword_chinese_best"),
        )

        record["headword_raw_best"] = title
        if romanized:
            record["headword_romanized_best"] = romanized
        if chinese:
            record["headword_chinese_best"] = chinese

        issues = record.get("issues", [])
        if "headword_repaired_from_ocr_heading" not in issues:
            issues.append("headword_repaired_from_ocr_heading")
        record["issues"] = issues

        note = "Headword repaired from raw_data/dictionary.OCR.md heading by scripts/repair_headwords_from_ocr_headings.py."
        existing_notes = record.get("notes") or ""
        if note not in existing_notes:
            record["notes"] = f"{existing_notes}\n{note}".strip()

        after = (
            record.get("headword_raw_best"),
            record.get("headword_romanized_best"),
            record.get("headword_chinese_best"),
        )
        if after != before:
            changed += 1

    DATA_PATH.write_text(
        "\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n",
        encoding="utf-8",
    )
    print(f"changed={changed}")


if __name__ == "__main__":
    main()
