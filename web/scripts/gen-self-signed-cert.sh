#!/usr/bin/env bash
# Generate a self-signed TLS cert for wiki nginx (idempotent).
set -euo pipefail

CERT_DIR="${WIKI_TLS_DIR:-/etc/nginx/certs}"
CN="${WIKI_TLS_CN:-localhost}"
DAYS="${WIKI_TLS_DAYS:-365}"

mkdir -p "${CERT_DIR}"

if [[ -f "${CERT_DIR}/fullchain.pem" && -f "${CERT_DIR}/privkey.pem" ]]; then
  echo "[gen-self-signed-cert] certs already exist in ${CERT_DIR}, skipping"
  exit 0
fi

echo "[gen-self-signed-cert] generating self-signed cert (CN=${CN}, days=${DAYS})"

openssl req -x509 -nodes -days "${DAYS}" -newkey rsa:2048 \
  -keyout "${CERT_DIR}/privkey.pem" \
  -out "${CERT_DIR}/fullchain.pem" \
  -subj "/CN=${CN}" \
  -addext "subjectAltName=DNS:${CN},DNS:localhost,IP:127.0.0.1"

chmod 600 "${CERT_DIR}/privkey.pem"
chmod 644 "${CERT_DIR}/fullchain.pem"

echo "[gen-self-signed-cert] wrote ${CERT_DIR}/fullchain.pem and privkey.pem"