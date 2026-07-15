#!/usr/bin/env bash
# Smoke-check Grafana iframe targets on a running prod wiki.
# Usage: WIKI_BASE_URL=https://127.0.0.1 ./scripts/verify-grafana-embed.sh
set -euo pipefail

BASE="${WIKI_BASE_URL:-https://127.0.0.1}"

health_tmp="$(mktemp)"
health_err="$(mktemp)"
health_rc=0
health_code="$(
  curl -sSk --max-time 15 -o "${health_tmp}" -w '%{http_code}' \
    "${BASE}/grafana/api/health" 2>"${health_err}"
)" || health_rc=$?
rm -f "${health_tmp}"
if [[ "${health_rc}" -ne 0 ]]; then
  echo "FAIL: curl health probe failed (rc=${health_rc})" >&2
  [[ -s "${health_err}" ]] && cat "${health_err}" >&2
  rm -f "${health_err}"
  exit 1
fi
rm -f "${health_err}"
if [ "${health_code}" != "200" ]; then
  echo "FAIL: ${BASE}/grafana/api/health -> ${health_code} (expected 200)" >&2
  exit 1
fi

page_tmp="$(mktemp)"
page_err="$(mktemp)"
if ! curl -sSk --max-time 15 -o "${page_tmp}" "${BASE}/llm-gateway" 2>"${page_err}"; then
  echo "FAIL: curl page probe failed" >&2
  [[ -s "${page_err}" ]] && cat "${page_err}" >&2
  rm -f "${page_tmp}" "${page_err}"
  exit 1
fi
page="$(cat "${page_tmp}")"
rm -f "${page_tmp}" "${page_err}"
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