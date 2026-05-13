#!/usr/bin/env python3
"""Generate missing pinyin for webapp records from OCR-derived Chinese headwords."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "webapp" / "data.json"
TMP_PYPINYIN = Path("/private/tmp/hucker_pypinyin")

if TMP_PYPINYIN.exists():
    sys.path.insert(0, str(TMP_PYPINYIN))

try:
    from pypinyin import Style, pinyin
except ImportError as exc:  # pragma: no cover - dependency guard
    raise SystemExit(
        "pypinyin is required. Install it with: "
        "python3 -m pip install --target /private/tmp/hucker_pypinyin pypinyin"
    ) from exc


HAN_RE = re.compile(r"[\u3400-\u9fff]+")
CONNECTOR_RE = re.compile(r"\s+(?:or|and)\s+|[;/；、]")
BAD_VARIANT_RE = re.compile(r"[?？&…\.\^,，:：0-9A-Za-z]")
UNCERTAIN_MARKERS = (
    "uncertain",
    "unrecoverable",
    "ocr",
    "corrupt",
    "mismatch",
    "incomplete",
    "noise",
)
STALE_PINYIN_ISSUE_PARTS = (
    "pinyin_uncertain",
    "pinyin_unrecoverable",
    "pinyin_not_confident",
    "pinyin_not_recoverable",
)


def chinese_source(record: dict) -> str:
    chinese = record.get("headword_chinese_best") or ""
    if HAN_RE.search(chinese):
        return chinese
    return record.get("headword_raw_best") or ""


def chinese_variants(source: str, allow_embedded_han: bool = False) -> list[str]:
    variants: list[str] = []
    for part in CONNECTOR_RE.split(source):
        part = part.strip()
        if not part:
            continue
        if BAD_VARIANT_RE.search(part):
            if allow_embedded_han and "…" not in part:
                variants.extend(HAN_RE.findall(part))
            continue
        han = "".join(HAN_RE.findall(part))
        comparable = (
            part.replace(" ", "")
            .replace("(", "")
            .replace(")", "")
            .replace("（", "")
            .replace("）", "")
        )
        if han and len(han) == len(comparable):
            variants.append(han)
    return list(dict.fromkeys(variants))


def to_pinyin(chinese: str) -> str | None:
    syllables = [item[0] for item in pinyin(chinese, style=Style.TONE, heteronym=False, errors="ignore")]
    if len(syllables) != len(chinese):
        return None
    return " ".join(syllables)


def pinyin_for_variants(variants: list[str]) -> str | None:
    rendered = []
    for variant in variants:
        converted = to_pinyin(variant)
        if not converted:
            return None
        rendered.append(converted)
    return "; ".join(list(dict.fromkeys(rendered)))


def repaired_issues(record: dict) -> list[str]:
    original = record.get("issues", [])
    issues = [
        issue
        for issue in original
        if not any(part in issue for part in STALE_PINYIN_ISSUE_PARTS)
    ]
    if "pinyin_generated_from_ocr_chinese" not in issues:
        issues.append("pinyin_generated_from_ocr_chinese")
    if any(any(marker in issue for marker in UNCERTAIN_MARKERS) for issue in original):
        if "pinyin_generated_from_uncertain_headword" not in issues:
            issues.append("pinyin_generated_from_uncertain_headword")
    return issues


def main() -> None:
    rows = [
        json.loads(line)
        for line in DATA_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]

    changed = 0
    skipped = 0
    for record in rows:
        if record.get("headword_pinyin_best"):
            continue
        structured_chinese = record.get("headword_chinese_best") or ""
        variants = chinese_variants(
            chinese_source(record),
            allow_embedded_han=not bool(HAN_RE.search(structured_chinese)),
        )
        generated = pinyin_for_variants(variants) if variants else None
        if not generated:
            skipped += 1
            continue
        record["headword_pinyin_best"] = generated
        record["issues"] = repaired_issues(record)
        note = "Pinyin generated from OCR-derived Chinese headword by scripts/fill_missing_pinyin.py."
        existing_notes = record.get("notes") or ""
        if note not in existing_notes:
            record["notes"] = f"{existing_notes}\n{note}".strip()
        changed += 1

    DATA_PATH.write_text(
        "\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n",
        encoding="utf-8",
    )
    print(f"changed={changed} skipped={skipped}")


if __name__ == "__main__":
    main()
