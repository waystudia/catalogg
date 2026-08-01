#!/usr/bin/env python3
"""Export the linked public schema as a reproducible audit appendix (read-only)."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUERY = """select table_name,
string_agg(column_name || ':' || data_type, ', ' order by ordinal_position) as columns
from information_schema.columns
where table_schema='public'
group by table_name order by table_name;"""

result = subprocess.run(
    ["supabase", "db", "query", "--linked", "--output", "json", QUERY],
    cwd=ROOT,
    check=True,
    capture_output=True,
    text=True,
)
payload = result.stdout[result.stdout.find("{"):]
rows = json.loads(payload)["rows"]
target = ROOT / "docs" / "legal" / "audit" / "supabase-schema-personal-data.tsv"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(
    "table\tcolumns\n" + "\n".join(f"{row['table_name']}\t{row['columns']}" for row in rows) + "\n",
    encoding="utf-8",
)
print(f"Exported {len(rows)} public tables to {target}")
