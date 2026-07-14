#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="${WIKI_TLS_DIR:-/etc/nginx/certs}"
TLS_MODE="${WIKI_TLS_MODE:-auto}"
SERVER_NAME="${WIKI_TLS_CN:-_}"

if [[ -f "${CERT_DIR}/fullchain.pem" && -f "${CERT_DIR}/privkey.pem" ]]; then
  echo "[entrypoint] using existing TLS certs from ${CERT_DIR}"
elif [[ "${TLS_MODE}" == "self-signed" || "${TLS_MODE}" == "auto" ]]; then
  export WIKI_TLS_DIR="${CERT_DIR}"
  /scripts/gen-self-signed-cert.sh
else
  echo "[entrypoint] ERROR: WIKI_TLS_MODE=${TLS_MODE} but certs missing in ${CERT_DIR}" >&2
  echo "[entrypoint] Run: make wiki-tls-issue" >&2
  exit 1
fi

resolver="$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf)"
if [ -z "${resolver}" ]; then
  resolver="127.0.0.11"
fi
sed -e "s/__RESOLVER__/${resolver}/g" \
    -e "s/__SERVER_NAME__/${SERVER_NAME}/g" \
  /scripts/wiki-prod.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'