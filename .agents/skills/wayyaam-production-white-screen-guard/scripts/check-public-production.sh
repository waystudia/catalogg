#!/usr/bin/env bash
set -euo pipefail

site_base=${1:-https://wayyaam.ru}
previous_asset=${2:-}
site_base=${site_base%/}

case "${site_base}" in
  https://wayyaam.ru|https://www.wayyaam.ru) ;;
  *) echo "Refusing unexpected production URL: ${site_base}" >&2; exit 2 ;;
esac

curl_args=(--silent --show-error --connect-timeout 8 --max-time 20)

expect_status() {
  local expected=${1:?expected status}
  local target_url=${2:?target URL}
  local actual
  actual=$(curl "${curl_args[@]}" --output /dev/null --write-out '%{http_code}' "${target_url}")
  if [[ ${actual} != "${expected}" ]]; then
    echo "Expected ${expected}, got ${actual}: ${target_url}" >&2
    exit 1
  fi
}

index_html=$(curl "${curl_args[@]}" --fail "${site_base}/")
main_asset=$(printf '%s' "${index_html}" | sed -nE 's#.*src="(/assets/index-[^"]+\.js)".*#\1#p' | head -n 1)
if [[ ! ${main_asset} =~ ^/assets/index-[A-Za-z0-9_-]+\.js$ ]]; then
  echo "Could not resolve the main hashed JavaScript asset" >&2
  exit 1
fi

expect_status 200 "${site_base}/"
expect_status 200 "https://www.wayyaam.ru/"
expect_status 200 "${site_base}/sw.js"
expect_status 200 "${site_base}${main_asset}"

if [[ -n ${previous_asset} ]]; then
  if [[ ! ${previous_asset} =~ ^/assets/[A-Za-z0-9._-]+\.js$ ]]; then
    echo "Invalid previous asset path: ${previous_asset}" >&2
    exit 2
  fi
  expect_status 200 "${site_base}${previous_asset}"
fi

unknown_result=$(curl "${curl_args[@]}" --output /dev/null --write-out '%{http_code}|%{content_type}' \
  "${site_base}/assets/wayyaam-production-guard-missing.js")
if [[ ${unknown_result%%|*} != 404 || ${unknown_result#*|} == text/html* ]]; then
  echo "Unknown hashed asset must be a non-HTML 404, got ${unknown_result}" >&2
  exit 1
fi

shell_headers=$(curl "${curl_args[@]}" --head "${site_base}/")
asset_headers=$(curl "${curl_args[@]}" --head "${site_base}${main_asset}")
if ! grep -Eiq '^cache-control:[[:space:]]*no-store' <<<"${shell_headers}"; then
  echo "Application shell is missing Cache-Control: no-store" >&2
  exit 1
fi
if ! grep -Eiq '^cache-control:.*max-age=31536000.*immutable' <<<"${asset_headers}"; then
  echo "Hashed asset is missing immutable one-year caching" >&2
  exit 1
fi
if ! grep -Eiq '^alt-svc:[[:space:]]*clear' <<<"${shell_headers}"; then
  echo "Application shell is missing Alt-Svc: clear" >&2
  exit 1
fi

printf 'https_sequence='
for request_number in 1 2 3 4 5 6 7 8 9 10; do
  request_status=$(curl "${curl_args[@]}" --output /dev/null --write-out '%{http_code}' \
    "${site_base}/?production-guard=${request_number}")
  if [[ ${request_status} != 200 ]]; then
    echo "request ${request_number} failed with ${request_status}" >&2
    exit 1
  fi
  if [[ ${request_number} == 10 ]]; then
    printf '%s\n' "${request_status}"
  else
    printf '%s ' "${request_status}"
  fi
done

echo "main_asset=${main_asset}"
[[ -z ${previous_asset} ]] || echo "previous_asset=${previous_asset}"
echo "unknown_asset=${unknown_result}"
echo "public_production_guard=passed"
