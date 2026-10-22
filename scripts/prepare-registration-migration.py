#!/usr/bin/env python3
"""Convert the four approved registration.xlsx fields into migration JSON.

The script treats workbook contents as data, validates them, removes the single
bootstrap row (refaladdress == 0), and orders users sponsor-first. It refuses to
guess corrections. Use --referral-fix only after the client confirms a change.
"""

import argparse
import json
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
ADDRESS = re.compile(r"^0x[0-9a-fA-F]{40}$")
FIELDS = ("walletaddress", "refaladdress", "level", "amount")


def workbook_rows(path: Path) -> list[dict[str, str]]:
    with ZipFile(path) as archive:
        shared_xml = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared = [
            "".join(node.text or "" for node in item.findall(".//m:t", NS))
            for item in shared_xml.findall("m:si", NS)
        ]
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))

    raw_rows: list[dict[str, str]] = []
    for row in sheet.findall(".//m:sheetData/m:row", NS):
        values: dict[str, str] = {}
        for cell in row.findall("m:c", NS):
            column = re.match(r"[A-Z]+", cell.attrib["r"])
            value_node = cell.find("m:v", NS)
            value = "" if value_node is None else (value_node.text or "")
            if cell.attrib.get("t") == "s" and value:
                value = shared[int(value)]
            if column:
                values[column.group()] = value.strip()
        raw_rows.append(values)

    if not raw_rows:
        return []
    headers = {column: value for column, value in raw_rows[0].items()}
    return [
        {headers[column]: value for column, value in row.items() if column in headers}
        for row in raw_rows[1:]
    ]


def parse_fixes(values: list[str]) -> dict[str, str]:
    fixes: dict[str, str] = {}
    for value in values:
        account, separator, sponsor = value.partition("=")
        if not separator or not ADDRESS.fullmatch(account) or not ADDRESS.fullmatch(sponsor):
            raise ValueError(f"invalid --referral-fix {value!r}; expected 0xACCOUNT=0xSPONSOR")
        fixes[account.lower()] = sponsor
    return fixes


def prepare(rows: list[dict[str, str]], fixes: dict[str, str]) -> dict[str, object]:
    errors: list[str] = []
    roots = [row for row in rows if row.get("refaladdress") == "0"]
    if len(roots) != 1:
        errors.append(f"expected exactly one bootstrap row, found {len(roots)}")
    bootstrap = roots[0].get("walletaddress", "") if len(roots) == 1 else ""

    records: list[dict[str, object]] = []
    wallets: set[str] = set()
    for number, row in enumerate(rows, start=2):
        missing = [field for field in FIELDS if not row.get(field)]
        if missing:
            errors.append(f"row {number}: missing {', '.join(missing)}")
            continue
        account = row["walletaddress"]
        sponsor = fixes.get(account.lower(), row["refaladdress"])
        if not ADDRESS.fullmatch(account):
            errors.append(f"row {number}: invalid walletaddress {account}")
        if sponsor != "0" and not ADDRESS.fullmatch(sponsor):
            errors.append(f"row {number}: invalid refaladdress {sponsor}")
        if account.lower() in wallets:
            errors.append(f"row {number}: duplicate walletaddress {account}")
        wallets.add(account.lower())
        try:
            level = int(row["level"])
            amount = int(row["amount"])
        except ValueError:
            errors.append(f"row {number}: level and amount must be whole numbers")
            continue
        if sponsor == "0":
            continue
        if not 1 <= level <= 12:
            errors.append(f"row {number}: level {level} is outside 1..12")
        expected = 30 * (2 ** (level - 1))
        if amount != expected:
            errors.append(f"row {number}: amount {amount} does not match level {level} (expected {expected})")
        records.append({"walletaddress": account, "refaladdress": sponsor, "level": level, "amount": str(amount)})

    known = {record["walletaddress"].lower() for record in records}
    if bootstrap:
        known.add(bootstrap.lower())
    for record in records:
        if record["refaladdress"].lower() not in known:
            errors.append(
                f"unresolved refaladdress {record['refaladdress']} for {record['walletaddress']}"
            )

    if errors:
        raise ValueError("\n".join(errors))

    # Stable topological ordering guarantees each sponsor is imported first.
    ordered: list[dict[str, object]] = []
    available = {bootstrap.lower()}
    pending = records[:]
    while pending:
        ready = [record for record in pending if record["refaladdress"].lower() in available]
        if not ready:
            raise ValueError("referral graph contains a cycle or cannot reach the bootstrap account")
        for record in ready:
            ordered.append(record)
            available.add(record["walletaddress"].lower())
            pending.remove(record)

    return {"bootstrap": bootstrap, "tokenDecimals": 6, "records": ordered}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--referral-fix", action="append", default=[], metavar="ACCOUNT=SPONSOR")
    args = parser.parse_args()
    try:
        payload = prepare(workbook_rows(args.input), parse_fixes(args.referral_fix))
    except (BadZipFile, KeyError, OSError, ValueError) as error:
        print(f"Migration preparation failed:\n{error}", file=sys.stderr)
        return 1
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(payload['records'])} registrations in {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
