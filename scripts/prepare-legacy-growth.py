#!/usr/bin/env python3
"""Validate the two historical growth CSVs and create a wallet-based payload."""

import argparse
import csv
import json
from pathlib import Path


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def prepare_tree(
    rows: list[dict[str, str]], tree: int, identities: dict[str, str]
) -> list[dict[str, object]]:
    member_key = "memberid"
    width = 2 if tree == 1 else 5
    member_ids = {row[member_key] for row in rows}
    records: list[dict[str, object]] = []
    seen_accounts: set[str] = set()
    roots = 0

    for row in rows:
        member_id = row[member_key]
        parent_id = row["parentid"]
        if member_id not in identities:
            raise ValueError(f"tree {tree}: unknown member ID {member_id}")
        if parent_id != "0" and parent_id not in member_ids:
            raise ValueError(f"tree {tree}: unresolved parent ID {parent_id}")
        if parent_id != "0" and parent_id not in identities:
            raise ValueError(f"tree {tree}: parent ID {parent_id} has no wallet")

        account = identities[member_id]
        if account.lower() in seen_accounts:
            raise ValueError(f"tree {tree}: duplicate account {account}")
        seen_accounts.add(account.lower())

        level = int(row["level"])
        position = int(row["position"])
        if level < 1:
            raise ValueError(f"tree {tree}: invalid level for {member_id}")
        positions_at_level = width ** (level - 1)
        if not 1 <= position <= positions_at_level:
            raise ValueError(f"tree {tree}: invalid position for {member_id}")
        if parent_id == "0":
            roots += 1
            if level != 1:
                raise ValueError(f"tree {tree}: root {member_id} must be level 1")
        elif level == 1:
            raise ValueError(f"tree {tree}: non-root {member_id} cannot be level 1")

        income1 = row.get("Position-1 Income", "0") or "0"
        income2 = row.get("Position-2 Income", "0") or "0"
        records.append({
            "tree": tree,
            "sourceId": int(row["id"]),
            "account": account,
            "parent": "0x0000000000000000000000000000000000000000"
            if parent_id == "0" else identities[parent_id],
            "generationId": int(row["genid"]),
            "position": position,
            "level": level,
            "position1Income": int(income1) * 1_000_000,
            "position2Income": int(income2) * 1_000_000,
        })

    if roots != 1:
        raise ValueError(f"tree {tree}: expected one root, found {roots}")
    return records


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("growthchart", type=Path)
    parser.add_argument("growthchart1", type=Path)
    parser.add_argument("identities", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    identity_rows = json.loads(args.identities.read_text(encoding="utf-8"))
    identities = {str(row["userid"]): row["wallet"] for row in identity_rows}
    records = [
        *prepare_tree(read_csv(args.growthchart), 1, identities),
        *prepare_tree(read_csv(args.growthchart1), 2, identities),
    ]
    payload = {"trees": {"1": 72, "2": 36}, "records": records}
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(records)} growth records in {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
