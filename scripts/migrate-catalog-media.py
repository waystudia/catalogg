#!/usr/bin/env python3
"""Run on the self-hosted VPS. Dry run by default; --apply verifies files before CAS updates.
Backups contain original records; keep them private. No rows or storage objects are deleted.
"""
import argparse, base64, datetime, hashlib, json, os, re, subprocess, urllib.request
from pathlib import Path


def sql(query):
    result = subprocess.run(['docker', 'exec', '-i', 'supabase-db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-At'], input=query, text=True, capture_output=True, check=True)
    return result.stdout.strip()


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--backup-dir', default='/opt/supabase-backups/media')
    args = parser.parse_args()
    # Only public catalog content; never private onboarding documents or payment QR.
    tables = ['product_images', 'categories', 'catalogs', 'catalog_sections', 'catalog_theme_settings', 'bookable_resources', 'product', 'category', 'restaurant', 'cabin', 'theme_settings', 'platform_categories', 'platform_banners']
    records = []
    for table in tables:
        rows = json.loads(sql(f"select coalesce(json_agg(t),'[]') from public.{table} t where to_jsonb(t)::text like '%data:image/%';"))
        records.extend((table, row) for row in rows)
    print(json.dumps({'records_with_embedded_images': len(records), 'tables': {t: sum(1 for name, _ in records if name == t) for t in tables}}))
    if not args.apply or not records:
        return
    backup_dir = Path(args.backup_dir)
    backup_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    backup = backup_dir / (datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.json')
    with os.fdopen(os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as handle:
        json.dump(records, handle)
    env = json.loads(subprocess.check_output(['docker', 'inspect', 'supabase-storage']))[0]['Config']['Env']
    key = next(value.split('=', 1)[1] for value in env if value.startswith('SERVICE_KEY='))
    base = 'https://api.wayyaam.ru/storage/v1/object/'
    mime_ext = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif'}
    cache = {}
    def visit(value, catalog_id):
        if isinstance(value, str) and value.startswith('data:image/'):
            if value in cache:
                return cache[value]
            match = re.fullmatch(r'data:(image/[^;,]+);base64,(.*)', value, re.S)
            if not match or match[1] not in mime_ext:
                raise ValueError('Unsupported embedded image; original database value kept')
            data = base64.b64decode(match[2], validate=True)
            digest = hashlib.sha256(data).hexdigest()
            path = f'catalog-assets/{catalog_id}/media/{digest}.{mime_ext[match[1]]}'
            request = urllib.request.Request(base + path, data=data, method='POST', headers={'Authorization': 'Bearer ' + key, 'apikey': key, 'Content-Type': match[1], 'x-upsert': 'true', 'cache-control': 'max-age=31536000'})
            with urllib.request.urlopen(request, timeout=30) as response:
                response.read()
            url = base + 'public/' + path
            with urllib.request.urlopen(url, timeout=30) as response:
                if hashlib.sha256(response.read()).hexdigest() != digest:
                    raise ValueError('Uploaded image hash mismatch; original database value kept')
            cache[value] = url
            return url
        if isinstance(value, list):
            return [visit(child, catalog_id) for child in value]
        if isinstance(value, dict):
            return {k: visit(child, catalog_id) for k, child in value.items()}
        return value
    changed = 0
    for table, row in records:
        # Global platform media has an explicit platform-admin-only prefix.
        catalog_id = row.get('catalog_id') or (row['id'] if table == 'catalogs' else 'platform')
        updated = visit(row, catalog_id)
        patch = {k: v for k, v in updated.items() if v != row[k]}
        if not patch:
            continue
        assignments = []
        for column, value in patch.items():
            original = row[column]
            encoded = json.dumps(value, ensure_ascii=False)
            # json_populate_record preserves each column's native text/json/array type.
            assignments.append(f'"{column}" = (json_populate_record(null::public.{table}, {literal(json.dumps({column: value}, ensure_ascii=False))}))."{column}"')
        query = f"update public.{table} set {', '.join(assignments)} where id::text={literal(str(row['id']))} and to_jsonb({table})={literal(json.dumps(row, ensure_ascii=False))}::jsonb returning id;"
        if not sql(query).splitlines()[0:1] == [str(row['id'])]:
            raise RuntimeError('Concurrent record change; original value not overwritten')
        changed += 1
    print(json.dumps({'updated_records': changed, 'verified_unique_files': len(cache), 'backup': str(backup)}))


if __name__ == '__main__':
    main()
