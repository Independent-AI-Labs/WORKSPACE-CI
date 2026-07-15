#!/usr/bin/env bash
# Production wiki lifecycle (Podman Compose). Invoked by web/Makefile prod-* targets.
# Runs as the current user; sudo is used only for sysctl when overriding to :80/:443.
set -euo pipefail
# pipefail: podman build | tee must surface podman rc, not tee rc

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECTS_ROOT="$(cd "${WEB_DIR}/../.." && pwd)"

PROD_IMAGE="${PROD_IMAGE:-localhost/workspace-ci-wiki:prod}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.prod.yaml}"
COMPOSE_CMD="${COMPOSE_CMD:-podman-compose}"
PODMAN="${PODMAN:-podman}"
PROD_HTTP_PORT="${PROD_HTTP_PORT:-8080}"
PROD_HTTPS_PORT="${PROD_HTTPS_PORT:-8443}"
BUILD_LOG="${BUILD_LOG:-/tmp/wiki-prod-build.log}"

resolve_cmd() {
  local var="$1" name="$2"
  local path=""
  if path="$(command -v "${name}" 2>&1)"; then
    printf -v "${var}" '%s' "${path}"
    export "${var}"
  fi
}

resolve_cmd PODMAN podman
resolve_cmd COMPOSE_CMD podman-compose

require_cmd() {
  local cmd="$1" var="$2"
  local path=""
  if ! path="$(command -v "${cmd}" 2>&1)"; then
    echo "ERROR: ${cmd} not on PATH. Set ${var}= or fix PATH." >&2
    echo "${path}" >&2
    exit 1
  fi
}

# Rootless podman cannot bind :80/:443 unless this sysctl allows it.
ensure_privileged_ports() {
  local need_port=1024
  if [ "${PROD_HTTP_PORT}" -lt 1024 ] && [ "${PROD_HTTP_PORT}" -lt "${need_port}" ]; then
    need_port="${PROD_HTTP_PORT}"
  fi
  if [ "${PROD_HTTPS_PORT}" -lt 1024 ] && [ "${PROD_HTTPS_PORT}" -lt "${need_port}" ]; then
    need_port="${PROD_HTTPS_PORT}"
  fi
  if [ "${need_port}" -ge 1024 ]; then
    return 0
  fi

  local current=1024
  if sysctl_out="$(sysctl -n net.ipv4.ip_unprivileged_port_start)"; then
    current="${sysctl_out}"
  else
    echo "[prod-start] sysctl unreadable; assuming unprivileged_port_start=1024" >&2
  fi
  if [ "${current}" -le "${need_port}" ]; then
    return 0
  fi

  echo "[prod-start] binding :${PROD_HTTP_PORT}/:${PROD_HTTPS_PORT} needs sysctl (sudo will prompt once)"
  sudo sysctl -w "net.ipv4.ip_unprivileged_port_start=${need_port}"
}

ensure_prod_image() {
  if "${PODMAN}" image exists "${PROD_IMAGE}"; then
    return 0
  fi
  if "${PODMAN}" image exists "localhost/workspace-ci-wiki:prod"; then
    echo "[prod-start] tagging localhost/workspace-ci-wiki:prod -> ${PROD_IMAGE}" >&2
    "${PODMAN}" tag "localhost/workspace-ci-wiki:prod" "${PROD_IMAGE}"
    return 0
  fi
  if "${PODMAN}" image exists "workspace-ci-wiki:prod"; then
    echo "[prod-start] tagging workspace-ci-wiki:prod -> ${PROD_IMAGE}" >&2
    "${PODMAN}" tag "workspace-ci-wiki:prod" "${PROD_IMAGE}"
    return 0
  fi
  echo "ERROR: production image ${PROD_IMAGE} not found." >&2
  echo "  Build first: make wiki-prod-build" >&2
  exit 1
}

compose_run() {
  local tls_dir="${WIKI_TLS_DIR:-${WEB_DIR}/../cloudflare/certs/${WIKI_TLS_CN:-localhost}}"
  mkdir -p "${tls_dir}"
  (
    cd "${WEB_DIR}"
    WIKI_HTTP_PORT="${PROD_HTTP_PORT}" WIKI_HTTPS_PORT="${PROD_HTTPS_PORT}" \
      ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-}" \
      WIKI_TLS_DIR="${tls_dir}" \
      WIKI_TLS_MODE="${WIKI_TLS_MODE:-auto}" \
      WIKI_TLS_CN="${WIKI_TLS_CN:-localhost}" \
      "${COMPOSE_CMD}" --podman-path "${PODMAN}" -f "${COMPOSE_FILE}" "$@"
  )
}

cmd_build() {
  require_cmd "${PODMAN}" PODMAN
  echo "[prod-build] Staging umbrella repo into ${PROJECTS_ROOT}/WORKSPACE-VM"
  node "${WEB_DIR}/scripts/stage-umbrella-repo.mjs"
  echo "[prod-build] Building ${PROD_IMAGE} from ${PROJECTS_ROOT}"
  echo "[prod-build] Logging to ${BUILD_LOG}"
  "${PODMAN}" build --progress=plain \
    -f "${WEB_DIR}/Containerfile" \
    -t "${PROD_IMAGE}" \
    "${PROJECTS_ROOT}" 2>&1 | tee "${BUILD_LOG}"
  if [[ "${PIPESTATUS[0]}" -ne 0 ]]; then
    echo "ERROR: podman build failed (rc=${PIPESTATUS[0]}); see ${BUILD_LOG}" >&2
    if [[ -f "${BUILD_LOG}" ]]; then
      echo "--- last 80 lines of ${BUILD_LOG} ---" >&2
      tail -n 80 "${BUILD_LOG}" >&2
    fi
    exit 1
  fi
  echo "[prod-build] OK tagged ${PROD_IMAGE}"
}

cmd_start() {
  require_cmd "${COMPOSE_CMD}" COMPOSE_CMD
  require_cmd "${PODMAN}" PODMAN
  ensure_privileged_ports
  ensure_prod_image
  compose_run up -d
  echo "[prod-start] HTTP  http://127.0.0.1:${PROD_HTTP_PORT}/  (redirects to HTTPS)"
  if [[ "${WIKI_TLS_MODE:-auto}" == "letsencrypt" ]]; then
    echo "[prod-start] HTTPS https://127.0.0.1:${PROD_HTTPS_PORT}/  (Let's Encrypt)"
  else
    echo "[prod-start] HTTPS https://127.0.0.1:${PROD_HTTPS_PORT}/  (self-signed or mounted certs)"
  fi
}

cmd_stop() {
  require_cmd "${COMPOSE_CMD}" COMPOSE_CMD
  require_cmd "${PODMAN}" PODMAN
  compose_run down
}

cmd_restart() {
  cmd_stop
  cmd_start
}

cmd_status() {
  require_cmd "${PODMAN}" PODMAN
  echo "Containers:"
  if ! "${PODMAN}" ps --filter name=wiki-ci- --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"; then
    echo "  WARNING: podman ps failed" >&2
  fi
  local http_code="000" https_code="000"
  local body_tmp curl_err
  body_tmp="$(mktemp)"
  curl_err="$(mktemp)"
  if ! http_code="$(
    curl -o "${body_tmp}" -w '%{http_code}' --max-time 5 \
      "http://127.0.0.1:${PROD_HTTP_PORT}/" 2>"${curl_err}"
  )"; then
    echo "  WARNING: HTTP probe failed" >&2
    [[ -s "${curl_err}" ]] && cat "${curl_err}" >&2
    http_code="error"
  fi
  rm -f "${body_tmp}" "${curl_err}"
  echo "HTTP  :${PROD_HTTP_PORT} -> ${http_code} (expect 301)"
  body_tmp="$(mktemp)"
  curl_err="$(mktemp)"
  if ! https_code="$(
    curl -sSk -o "${body_tmp}" -w '%{http_code}' --max-time 10 \
      "https://127.0.0.1:${PROD_HTTPS_PORT}/" 2>"${curl_err}"
  )"; then
    echo "  WARNING: HTTPS probe failed" >&2
    [[ -s "${curl_err}" ]] && cat "${curl_err}" >&2
    https_code="error"
  fi
  rm -f "${body_tmp}" "${curl_err}"
  echo "HTTPS :${PROD_HTTPS_PORT} -> ${https_code} (expect 200)"
}

cmd_logs() {
  require_cmd "${COMPOSE_CMD}" COMPOSE_CMD
  require_cmd "${PODMAN}" PODMAN
  compose_run logs --tail=100
}

usage() {
  echo "Usage: $0 {build|start|stop|restart|status|logs}" >&2
  exit 1
}

main() {
  case "${1:-}" in
    build) cmd_build ;;
    start) cmd_start ;;
    stop) cmd_stop ;;
    restart) cmd_restart ;;
    status) cmd_status ;;
    logs) cmd_logs ;;
    *) usage ;;
  esac
}

main "$@"