#!/usr/bin/env python3
"""Fill missing webapp JSONL records from the OCR markdown entry stream."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OCR_PATH = ROOT / "raw_data" / "dictionary.OCR.md"
DATA_PATH = ROOT / "webapp" / "data.json"

ENTRY_RE = re.compile(r"^(?:#{2,6}\s*)?(?:\*\s*)?(?P<id>\d{1,4})\.?\s+(?P<rest>.+?)\s*$")
BODY_MARKER_RE = re.compile(
    r"\s(?=(?:N-S DIV|T'ANG-SUNG|T'ANG|SUNG|SUI|CH'ING|CHIN|YUAN|MING|HAN|"
    r"CHOU|LIAO|SUI-T'ANG|SUI-CH'ING|YUAN-CH'ING|MING-CH'ING|CHIN-CH'ING|"
    r"T'ANG-CH'ING|SUNG-CH'ING|Lit\.|Chinese transcriptions|Surveillance Commission|"
    r"Pacification Commissioner|Grand Princess|\(\d\))[:\s])"
)

STALE_ISSUES = {
    "missing_from_extraction",
    "likely_merged_into_other_entry",
    "no_source_text",
    "missing_body",
    "no_source_entry",
    "no_body_available",
    "cannot_reconstruct",
    "reconstruction_not_possible",
    "body_unrecoverable",
}

MANUAL_BACKFILLS = {
    # OCR placed this body before its heading.
    3791: {
        "title": "liù hsién 六閑",
        "body": "T'ANG: abbreviation of chang-nei liu hsien (Six Palace Corrals).",
    },
    # OCR repeats the preceding number; this is the skipped entry 295 in sequence.
    295: {
        "title": "chào-mó chiĕn kuăn-kōu chʻéng-fā chià-kó 照磨兼管勾承發架閣",
        "body": "YUAN: Record Keeper and Clerk-storekeeper, one, rank not clear, in the Bureau of Transmission (t'ung-cheng yüan) at Peking from 1311 on. P12.",
    },
    # OCR misread this as a duplicate 4359; sequence shows it belongs before 4351.
    4350: {
        "title": "nũ-yến 女鹽",
        "body": "CHOU: Salt Maid, 20 palace women subordinate to 2 eunuch Salt Stewards (yen-jen) of the Ministry of State (t'ien-kuan); prepared and provided salt for use by members of the royal family and in appropriate ceremonies. CL: femme au sel.",
    },
}

FORCE_BACKFILL_IDS = {4350, 4358, 4359}


def parse_ocr_entries(text: str) -> dict[int, dict[str, str]]:
    entries: dict[int, dict[str, str]] = {}
    current_id: int | None = None
    current_title = ""
    current_parts: list[str] = []

    def flush() -> None:
        if current_id is None:
            return
        body = "\n\n".join(part.strip() for part in current_parts if part.strip())
        entries[current_id] = {
            "title": current_title.strip(),
            "body": body.strip(),
        }

    for raw_line in text.splitlines():
        line = raw_line.strip()
        match = ENTRY_RE.match(line)
        if match:
            entry_id = int(match.group("id"))
            has_marker = line.startswith("## ")
            is_next_unmarked = current_id is not None and entry_id == current_id + 1
            if 1 <= entry_id <= 8291 and (has_marker or is_next_unmarked):
                flush()
                current_id = entry_id
                rest = match.group("rest")
                body_match = BODY_MARKER_RE.search(rest)
                if body_match:
                    current_title = rest[: body_match.start()].strip()
                    current_parts = [rest[body_match.start() :].strip()]
                else:
                    current_title = rest.strip()
                    current_parts = []
                continue

        if current_id is not None:
            current_parts.append(raw_line)

    flush()
    return entries


def repaired_issues(record: dict) -> list[str]:
    issues = [
        issue
        for issue in record.get("issues", [])
        if issue not in STALE_ISSUES
        and not issue.startswith("local_repair: extracted from parent")
        and not issue.startswith("local_repair_from_parent")
        and not issue.startswith("candidate_parent")
    ]
    if "local_repair_from_ocr_markdown" not in issues:
        issues.append("local_repair_from_ocr_markdown")
    return issues


def normalize_body(body: str) -> str:
    lines = []
    for line in body.splitlines():
        lines.append(re.sub(r"^#{2,6}\s*", "", line).strip() if line.lstrip().startswith("#") else line)
    return "\n".join(lines).strip()


def main() -> None:
    ocr_entries = parse_ocr_entries(OCR_PATH.read_text(encoding="utf-8"))
    rows = [
        json.loads(line)
        for line in DATA_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]

    changed = 0
    fillable = 0
    for record in rows:
        entry = MANUAL_BACKFILLS.get(record["id"]) or ocr_entries.get(record["id"])
        needs_body = not record.get("body_best") or record.get("body_status") == "pending"
        needs_source = not record.get("source_entry_ids")
        force_backfill = record["id"] in FORCE_BACKFILL_IDS
        if not entry or not (needs_body or needs_source or force_backfill):
            if (
                "local_repair_from_ocr_markdown" in record.get("issues", [])
                and record.get("body_best")
            ):
                cleaned = normalize_body(record["body_best"])
                if cleaned != record["body_best"]:
                    record["body_best"] = cleaned
                    changed += 1
            continue

        if entry["body"]:
            fillable += 1
            record["body_best"] = normalize_body(entry["body"])
            if record.get("body_status") == "pending" or not record.get("body_status"):
                record["body_status"] = "candidate"

        if entry["title"] and (force_backfill or not record.get("headword_raw_best")):
            record["headword_raw_best"] = entry["title"]
            if record.get("title_status") == "pending" or not record.get("title_status"):
                record["title_status"] = "candidate"

        if not record.get("source_entry_ids"):
            record["source_entry_ids"] = [record["id"]]

        if record.get("start_page") is None:
            record["start_page"] = None
        if record.get("start_column") is None:
            record["start_column"] = ""

        record["issues"] = repaired_issues(record)
        note = "Filled from raw_data/dictionary.OCR.md by scripts/fill_webapp_from_ocr.py."
        existing_notes = record.get("notes") or ""
        if note not in existing_notes:
            record["notes"] = f"{existing_notes}\n{note}".strip()
        changed += 1

    DATA_PATH.write_text(
        "\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n",
        encoding="utf-8",
    )
    print(f"changed={changed} fillable_bodies={fillable} ocr_entries={len(ocr_entries)}")


if __name__ == "__main__":
    main()
