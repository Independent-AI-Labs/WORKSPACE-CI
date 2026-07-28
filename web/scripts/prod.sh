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
PROD_UNIT="${PROD_UNIT:-wiki-prod-compose.service}"
WIKI_PUBLIC_URL="${WIKI_PUBLIC_URL:-https://workspaceguardrails.com/}"
SETTLE_SECONDS="${SETTLE_SECONDS:-20}"

unit_installed() {
  local unit_dump="" unit_rc=0
  unit_dump="$(systemctl --user cat "${PROD_UNIT}" 2>&1)" || unit_rc=$?
  return "${unit_rc}"
}

systemd_delegate() {
  local action="$1"
  echo "[prod-${action}] ${PROD_UNIT} installed; delegating to: systemctl --user ${action} ${PROD_UNIT}"
  systemctl --user "${action}" "${PROD_UNIT}"
}

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
      WIKI_HOME_LANDING_ENABLED="${WIKI_HOME_LANDING_ENABLED:-true}" \
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
  local ci_context_dir
  ci_context_dir="$(basename "$(dirname "${WEB_DIR}")")"
  echo "[prod-build] Build-context repo dir: ${ci_context_dir}"
  "${PODMAN}" build --progress=plain \
    --build-arg "CI_CONTEXT_DIR=${ci_context_dir}" \
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
  require_cmd "${PODMAN}" PODMAN
  if unit_installed; then
    systemd_delegate start
  else
    require_cmd "${COMPOSE_CMD}" COMPOSE_CMD
    ensure_privileged_ports
    ensure_prod_image
    compose_run up -d
  fi
  echo "[prod-start] HTTP  http://127.0.0.1:${PROD_HTTP_PORT}/  (redirects to HTTPS)"
  if [[ "${WIKI_TLS_MODE:-auto}" == "letsencrypt" ]]; then
    echo "[prod-start] HTTPS https://127.0.0.1:${PROD_HTTPS_PORT}/  (Let's Encrypt)"
  else
    echo "[prod-start] HTTPS https://127.0.0.1:${PROD_HTTPS_PORT}/  (self-signed or mounted certs)"
  fi
}

cmd_stop() {
  require_cmd "${PODMAN}" PODMAN
  if unit_installed; then
    systemd_delegate stop
  else
    require_cmd "${COMPOSE_CMD}" COMPOSE_CMD
    compose_run down
  fi
}

cmd_restart() {
  if unit_installed; then
    systemd_delegate restart
  else
    cmd_stop
    cmd_start
  fi
  cmd_verify
}

retry_probe() {
  local url="$1" max_tries="$2" curl_args=("${@:3}")
  local code="" try=1 curl_rc=0 curl_err
  curl_err="$(mktemp)"
  while (( try <= max_tries )); do
    : >"${curl_err}"
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "${curl_args[@]}" "${url}" 2>"${curl_err}")" || curl_rc=$?
    [[ -n "${code}" && "${code}" != "000" ]] && { rm -f "${curl_err}"; printf '%s' "${code}"; return 0; }
    sleep 2
    try=$((try + 1))
  done
  if [[ -s "${curl_err}" ]]; then
    echo "[verify] last curl error for ${url} (rc=${curl_rc}):" >&2
    cat "${curl_err}" >&2
  fi
  rm -f "${curl_err}"
  printf '%s' "${code:-000}"
}

cmd_verify() {
  require_cmd "${PODMAN}" PODMAN
  local failures=0
  echo "== wiki prod health report =="

  if unit_installed; then
    local unit_state unit_wd unit_tls repo_root
    local is_active_rc=0
    unit_state="$(systemctl --user is-active "${PROD_UNIT}" 2>&1)" || is_active_rc=$?
    echo "Unit     : ${PROD_UNIT} -> ${unit_state}"
    [[ "${unit_state}" == "active" ]] || failures=$((failures + 1))
    repo_root="$(cd "${WEB_DIR}/.." && pwd -P)"
    local wd_rc=0 env_dump="" env_rc=0
    unit_wd="$(systemctl --user show "${PROD_UNIT}" -p WorkingDirectory --value 2>&1)" || wd_rc=$?
    if (( wd_rc != 0 )); then
      echo "WARNING: systemctl show WorkingDirectory failed: ${unit_wd}" >&2
      unit_wd=""
    fi
    env_dump="$(systemctl --user show "${PROD_UNIT}" -p Environment --value 2>&1)" || env_rc=$?
    if (( env_rc != 0 )); then
      echo "WARNING: systemctl show Environment failed: ${env_dump}" >&2
      env_dump=""
    fi
    unit_tls="$(printf '%s\n' "${env_dump}" | tr ' ' '\n' | sed -n 's/^WIKI_TLS_DIR=//p')"
    if [[ -n "${unit_wd}" && "${unit_wd}" != "${repo_root}/web" ]]; then
      echo "DRIFT    : unit WorkingDirectory=${unit_wd} but repo is ${repo_root}; run: make wiki-prod-deploy" >&2
      failures=$((failures + 1))
    fi
    if [[ -n "${unit_tls}" && ! -d "${unit_tls}" ]]; then
      echo "DRIFT    : unit WIKI_TLS_DIR=${unit_tls} does not exist; run: make wiki-prod-deploy" >&2
      failures=$((failures + 1))
    fi
  else
    echo "Unit     : ${PROD_UNIT} not installed (raw compose mode)"
  fi

  local c running ids_before ids_after
  local deadline=$((SECONDS + 60))
  for c in wiki-ci-app wiki-ci-nginx; do
    running=""
    local inspect_rc=0
    while (( SECONDS < deadline )); do
      running="$("${PODMAN}" inspect -f '{{.State.Running}}' "${c}" 2>&1)" || inspect_rc=$?
      [[ "${running}" == "true" ]] && break
      sleep 2
    done
    if [[ "${running}" == "true" ]]; then
      echo "Container: ${c} -> running"
    else
      echo "Container: ${c} -> NOT RUNNING" >&2
      failures=$((failures + 1))
    fi
  done
  ids_before="$("${PODMAN}" ps --filter name=wiki-ci- --format '{{.ID}}' | sort | tr '\n' ' ')"

  local http_code https_code
  http_code="$(retry_probe "http://127.0.0.1:${PROD_HTTP_PORT}/" 10)"
  if [[ "${http_code}" == "301" ]]; then
    echo "HTTP     : :${PROD_HTTP_PORT} -> ${http_code} (ok)"
  else
    echo "HTTP     : :${PROD_HTTP_PORT} -> ${http_code} (expect 301)" >&2
    failures=$((failures + 1))
  fi
  https_code="$(retry_probe "https://127.0.0.1:${PROD_HTTPS_PORT}/" 10 -k)"
  if [[ "${https_code}" == "200" ]]; then
    echo "HTTPS    : :${PROD_HTTPS_PORT} -> ${https_code} (ok)"
  else
    echo "HTTPS    : :${PROD_HTTPS_PORT} -> ${https_code} (expect 200)" >&2
    failures=$((failures + 1))
  fi

  local tls_host tls_subject tls_expiry
  tls_host="$(printf '%s' "${WIKI_PUBLIC_URL}" | sed -E 's|^https?://([^/:]+).*|\1|')"
  local s_client_out="" s_client_rc=0
  s_client_out="$(echo | openssl s_client -connect "127.0.0.1:${PROD_HTTPS_PORT}" -servername "${tls_host}" 2>&1)" || s_client_rc=$?
  tls_subject=""
  tls_expiry=""
  if (( s_client_rc == 0 )); then
    tls_subject="$(printf '%s' "${s_client_out}" | openssl x509 -noout -subject 2>&1)" || tls_subject=""
    tls_expiry="$(printf '%s' "${s_client_out}" | openssl x509 -noout -enddate 2>&1)" || tls_expiry=""
  fi
  [[ -n "${tls_subject}" ]] && echo "TLS      : ${tls_subject} ${tls_expiry}"

  if [[ -n "${WIKI_PUBLIC_URL}" ]]; then
    local pub_code
    pub_code="$(retry_probe "${WIKI_PUBLIC_URL}" 3)"
    if [[ "${pub_code}" == "200" ]]; then
      echo "Public   : ${WIKI_PUBLIC_URL} -> ${pub_code} (ok)"
    else
      echo "Public   : WARNING ${WIKI_PUBLIC_URL} -> ${pub_code} (warn-only; external path)" >&2
    fi
  fi

  echo "[verify] settle check: ${SETTLE_SECONDS}s (must exceed unit RestartSec) to catch manager fights"
  sleep "${SETTLE_SECONDS}"
  ids_after="$("${PODMAN}" ps --filter name=wiki-ci- --format '{{.ID}}' | sort | tr '\n' ' ')"
  if [[ "${ids_before}" != "${ids_after}" ]]; then
    echo "FAIL     : container set changed during settle; another manager is fighting this stack" >&2
    local events_out="" events_rc=0 events_tmp
    events_tmp="$(mktemp)"
    events_out="$("${PODMAN}" events --since 2m --stream=false 2>&1)" || events_rc=$?
    printf '%s\n' "${events_out}" >"${events_tmp}"
    tail -n 30 "${events_tmp}" >&2
    rm -f "${events_tmp}"
    failures=$((failures + 1))
  fi
  for c in wiki-ci-app wiki-ci-nginx; do
    local settle_rc=0
    running="$("${PODMAN}" inspect -f '{{.State.Running}}' "${c}" 2>&1)" || settle_rc=$?
    if [[ "${running}" != "true" ]]; then
      echo "FAIL     : ${c} not running after settle" >&2
      failures=$((failures + 1))
    fi
  done

  if (( failures > 0 )); then
    echo "== failure detail ==" >&2
    local ps_rc=0 journal_rc=0 logs_rc=0
    "${PODMAN}" ps -a --filter name=wiki-ci- >&2 2>&1 || ps_rc=$?
    if unit_installed; then
      journalctl --user -u "${PROD_UNIT}" -n 50 --no-pager >&2 2>&1 || journal_rc=$?
    fi
    for c in wiki-ci-app wiki-ci-nginx; do
      echo "--- podman logs ${c} (tail 50) ---" >&2
      "${PODMAN}" logs --tail 50 "${c}" >&2 2>&1 || logs_rc=$?
    done
    echo "HEALTH   : FAIL (${failures} check(s) failed)" >&2
    exit 1
  fi
  echo "HEALTH   : OK"
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
  echo "Usage: $0 {build|start|stop|restart|verify|status|logs}" >&2
  exit 1
}

main() {
  case "${1:-}" in
    build) cmd_build ;;
    start) cmd_start ;;
    stop) cmd_stop ;;
    restart) cmd_restart ;;
    verify) cmd_verify ;;
    status) cmd_status ;;
    logs) cmd_logs ;;
    *) usage ;;
  esac
}

main "$@"