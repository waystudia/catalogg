#!/usr/bin/env python3
"""Create a reproducible line-level inventory of data-processing code surfaces."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCAN_ROOTS = [ROOT / "src", ROOT / "supabase"]
TEXT_SUFFIXES = {".ts", ".tsx", ".sql", ".mjs", ".js"}

patterns = {
    "Маршруты приложения": re.compile(r"<Route\s+path=|path:\s*['\"]"),
    "HTML-формы": re.compile(r"<form\b"),
    "Поля ввода и загрузки": re.compile(r"<(?:input|textarea|select)\b|type=['\"]file['\"]"),
    "Supabase таблицы": re.compile(r"\.from\(\s*['\"][^'\"]+['\"]\s*\)"),
    "Supabase RPC": re.compile(r"\.rpc\(\s*['\"][^'\"]+['\"]"),
    "Storage": re.compile(r"\.storage\b|storage\.from\("),
    "Realtime": re.compile(r"\.channel\(|postgres_changes"),
    "Сетевые запросы": re.compile(r"\bfetch\(|https?://|wa\.me"),
    "localStorage": re.compile(r"localStorage|waycatalog-|wayyaam:"),
    "sessionStorage": re.compile(r"sessionStorage"),
    "IndexedDB/Cache/SW": re.compile(r"indexedDB|CacheStorage|caches\.|registerRoute\("),
    "Геолокация/карты": re.compile(r"geolocation|watchPosition|getCurrentPosition|nominatim|openstreetmap|osrm|arcgis|yandex"),
    "Push/email/WhatsApp": re.compile(r"PushSubscription|Notification\.|web_push|send-web-push|mailto:|whatsapp|wa\.me", re.I),
    "Логи и аудит": re.compile(r"audit_logs|console\.(?:error|warn|log)|logger|error_log", re.I),
}

files = sorted(
    path for base in SCAN_ROOTS for path in base.rglob("*")
    if path.is_file() and path.suffix in TEXT_SUFFIXES and "node_modules" not in path.parts
)

sections: dict[str, list[str]] = {name: [] for name in patterns}
for path in files:
    relative = path.relative_to(ROOT)
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        continue
    for line_number, line in enumerate(lines, 1):
        compact = " ".join(line.strip().split())
        if not compact or compact.startswith("//") or compact.startswith("--"):
            continue
        for name, pattern in patterns.items():
            if pattern.search(line):
                sections[name].append(f"- `{relative}:{line_number}` - `{compact[:260]}`")

target = ROOT / "docs" / "legal" / "audit" / "code-processing-surface.md"
parts = [
    "# Линейный реестр поверхностей обработки данных",
    "",
    "Автоматический срез исходников WayYaam на 31 июля 2026 года. Он дополняет правовой аудит точными файлами и строками; совпадение не всегда означает обработку персональных данных, но ни одна найденная точка не должна исключаться без ручной классификации.",
    "",
    f"Проверено файлов: **{len(files)}**.",
]
for name, items in sections.items():
    parts.extend(["", f"## {name} ({len(items)})", ""])
    parts.extend(items or ["Совпадений не найдено."])
target.write_text("\n".join(parts) + "\n", encoding="utf-8")
print(f"Exported {sum(map(len, sections.values()))} line references to {target}")
