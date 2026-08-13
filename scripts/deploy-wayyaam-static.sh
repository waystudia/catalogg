#!/usr/bin/env bash
set -euo pipefail

source_dir=${1:?Usage: deploy-wayyaam-static.sh SOURCE_DIR RELEASE_NAME [WEB_ROOT]}
release_name=${2:?Usage: deploy-wayyaam-static.sh SOURCE_DIR RELEASE_NAME [WEB_ROOT]}
web_root=${3:-/var/www/wayyaam.ru}

source_dir=${source_dir%/}
web_root=${web_root%/}

if [[ ! ${release_name} =~ ^release-[A-Za-z0-9._-]+$ ]]; then
  echo "Invalid release name: ${release_name}" >&2
  exit 2
fi

if [[ ! -f ${source_dir}/index.html || ! -d ${source_dir}/assets ]]; then
  echo "Source directory must contain index.html and assets/" >&2
  exit 2
fi

main_asset=$(sed -nE 's#.*<script[^>]+src="([^"]*/assets/index-[^"]+\.js)".*#\1#p' "${source_dir}/index.html" | head -n 1)
main_asset_path=${source_dir}/${main_asset#/}

if [[ -z ${main_asset} || ! -f ${main_asset_path} ]]; then
  echo "Production bundle is missing its main JavaScript asset" >&2
  exit 4
fi

if ! grep -Fq 'api.wayyaam.ru' "${main_asset_path}"; then
  echo "Refusing release: main bundle has no api.wayyaam.ru Supabase URL" >&2
  exit 4
fi

if ! grep -Eq 'sb_publishable_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}' "${main_asset_path}"; then
  echo "Refusing release: main bundle has no browser-safe Supabase key" >&2
  exit 4
fi

release_dir=${web_root}/releases/${release_name}
shared_assets_dir=${web_root}/shared-static/assets

if [[ -e ${release_dir} || -L ${release_dir} ]]; then
  echo "Release already exists: ${release_dir}" >&2
  exit 3
fi

install -d -m 755 "${web_root}/releases" "${shared_assets_dir}" "${release_dir}"
rsync -a --exclude='/assets/' "${source_dir}/" "${release_dir}/"
rsync -a "${source_dir}/assets/" "${shared_assets_dir}/"
ln -s ../../shared-static/assets "${release_dir}/assets"

find "${release_dir}" -type d -exec chmod 755 {} +
find "${release_dir}" -type f -exec chmod 644 {} +
find "${shared_assets_dir}" -type d -exec chmod 755 {} +
find "${shared_assets_dir}" -type f -exec chmod 644 {} +

ln -sfn "releases/${release_name}" "${web_root}/current"
test "$(readlink "${web_root}/current")" = "releases/${release_name}"
