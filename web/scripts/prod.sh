#!/usr/bin/env bash
# Production wiki lifecycle (Podman Compose). Invoked by web/Makefile prod-* targets.
# Runs as the current user; sudo is used only for sysctl when binding :80/:443.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECTS_ROOT="$(cd "${WEB_DIR}/../.." && pwd)"

PROD_IMAGE="${PROD_IMAGE:-localhost/workspace-ci-wiki:prod}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.prod.yaml}"
COMPOSE_CMD="${COMPOSE_CMD:-podman-compose}"
PODMAN="${PODMAN:-podman}"
PROD_HTTP_PORT="${PROD_HTTP_PORT:-80}"
PROD_HTTPS_PORT="${PROD_HTTPS_PORT:-443}"

resolve_cmd() {
  local var="$1" name="$2"
  if [ "${!var}" = "${name}" ] && command -v "${name}" >/dev/null 2>&1; then
    printf -v "${var}" '%s' "$(command -v "${name}")"
    export "${var}"
  fi
}

resolve_cmd PODMAN podman
resolve_cmd COMPOSE_CMD podman-compose

require_cmd() {
  local cmd="$1" var="$2"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "ERROR: ${cmd} not on PATH. Set ${var}= or fix PATH." >&2
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
  if "${PODMAN}" image exists "${PROD_IMAGE}" >/dev/null 2>&1; then
    return 0
  fi
  # Accept older image tags from previous builds.
  if "${PODMAN}" image exists "localhost/workspace-ci-wiki:prod" >/dev/null 2>&1; then
    "${PODMAN}" tag "localhost/workspace-ci-wiki:prod" "${PROD_IMAGE}"
    return 0
  fi
  if "${PODMAN}" image exists "workspace-ci-wiki:prod" >/dev/null 2>&1; then
    "${PODMAN}" tag "workspace-ci-wiki:prod" "${PROD_IMAGE}"
    return 0
  fi
  echo "ERROR: production image ${PROD_IMAGE} not found." >&2
  echo "  Build first: make wiki-prod-build" >&2
  exit 1
}

compose_run() {
  (
    cd "${WEB_DIR}"
    WIKI_HTTP_PORT="${PROD_HTTP_PORT}" WIKI_HTTPS_PORT="${PROD_HTTPS_PORT}" \
      ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-}" \
      "${COMPOSE_CMD}" --podman-path "${PODMAN}" -f "${COMPOSE_FILE}" "$@"
  )
}

cmd_build() {
  require_cmd "${PODMAN}" PODMAN
  echo "[prod-build] Building ${PROD_IMAGE} from ${PROJECTS_ROOT}"
  "${PODMAN}" build -f "${WEB_DIR}/Containerfile" -t "${PROD_IMAGE}" "${PROJECTS_ROOT}"
}

cmd_start() {
  require_cmd "${COMPOSE_CMD}" COMPOSE_CMD
  require_cmd "${PODMAN}" PODMAN
  ensure_privileged_ports
  ensure_prod_image
  compose_run up -d
  echo "[prod-start] HTTP  http://127.0.0.1:${PROD_HTTP_PORT}/  (redirects to HTTPS)"
  echo "[prod-start] HTTPS https://127.0.0.1:${PROD_HTTPS_PORT}/  (self-signed)"
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
  if ! http_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${PROD_HTTP_PORT}/")"; then
    echo "  WARNING: HTTP probe failed" >&2
    http_code="error"
  fi
  echo "HTTP  :${PROD_HTTP_PORT} -> ${http_code} (expect 301)"
  if ! https_code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "https://127.0.0.1:${PROD_HTTPS_PORT}/")"; then
    echo "  WARNING: HTTPS probe failed" >&2
    https_code="error"
  fi
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