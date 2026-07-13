#!/usr/bin/env bash
# Smoke-check Grafana iframe targets on a running prod wiki.
# Usage: WIKI_BASE_URL=https://127.0.0.1 ./scripts/verify-grafana-embed.sh
set -euo pipefail

BASE="${WIKI_BASE_URL:-https://127.0.0.1}"
CURL=(curl -sk --max-time 15)

health_code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "${BASE}/grafana/api/health")"
if [ "${health_code}" != "200" ]; then
  echo "FAIL: ${BASE}/grafana/api/health -> ${health_code} (expected 200)" >&2
  exit 1
fi

page="$("${CURL[@]}" "${BASE}/llm-gateway")"
iframe_src="$(echo "${page}" | sed -n 's/.*<iframe src="\([^"]*\)".*/\1/p' | head -1 | sed 's/&amp;/\&/g')"
if [ -z "${iframe_src}" ]; then
  echo "FAIL: /llm-gateway has no iframe src" >&2
  exit 1
fi
if echo "${iframe_src}" | grep -qE 'localhost:3030|127\.0\.0\.1:3030'; then
  echo "FAIL: iframe src points at loopback Grafana port 3030: ${iframe_src}" >&2
  exit 1
fi
if ! echo "${iframe_src}" | grep -q '/grafana/d/'; then
  echo "FAIL: iframe src does not use /grafana/ subpath: ${iframe_src}" >&2
  exit 1
fi

echo "OK: Grafana proxy healthy and iframe targets use same-origin /grafana/"