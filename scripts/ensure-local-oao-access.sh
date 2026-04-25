#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
STATE_DIR="${ROOT_DIR}/.oao-local"
UI_LOG="${STATE_DIR}/ui-port-forward.log"
API_LOG="${STATE_DIR}/api-port-forward.log"
UI_PID_FILE="${STATE_DIR}/ui-port-forward.pid"
API_PID_FILE="${STATE_DIR}/api-port-forward.pid"
NGINX_CONF="${STATE_DIR}/default.conf"
MONITOR_LOG="${STATE_DIR}/bridge-monitor.log"
MONITOR_PID_FILE="${STATE_DIR}/bridge-monitor.pid"
PROXY_CONTAINER="oao-local-proxy"
NAMESPACE="${OAO_NAMESPACE:-open-agent-orchestra}"
UI_RESOURCE="${OAO_UI_RESOURCE:-svc/oao-ui}"
API_RESOURCE="${OAO_API_RESOURCE:-svc/oao-api}"
UI_PORT="${OAO_UI_PORT:-3002}"
API_PORT="${OAO_API_PORT:-4002}"
HOST_NAME="${OAO_HOSTNAME:-oao.local}"
READY_URL="${OAO_READY_URL:-http://${HOST_NAME}/api/auth/providers?workspace=default}"
READY_HOST_HEADER="${OAO_READY_HOST_HEADER:-${HOST_NAME}}"
MONITOR_INTERVAL_SECONDS="${OAO_BRIDGE_MONITOR_INTERVAL_SECONDS:-2}"

mkdir -p "${STATE_DIR}"

print_usage() {
  cat <<EOF
Usage: $(basename "$0") [start|stop|restart|status|logs|--monitor]

Commands:
  start    Ensure the local oao.local bridge is running (default)
  stop     Stop the managed port-forwards, monitor, and local proxy
  restart  Stop then start the bridge again
  status   Show whether the monitor, port-forwards, and proxy are healthy
  logs     Print recent bridge logs
EOF
}

is_http_ready() {
  local url="$1"
  curl -fsSI --max-time 2 "$url" >/dev/null 2>&1
}

is_http_ready_get() {
  local url="$1"
  local host_header="${2:-}"
  if [[ -n "$host_header" ]]; then
    curl -fsS --max-time 2 -H "Host: ${host_header}" "$url" >/dev/null 2>&1
    return 0
  fi
  curl -fsS --max-time 2 "$url" >/dev/null 2>&1
}

is_pid_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

is_proxy_running() {
  docker ps --filter "name=^/${PROXY_CONTAINER}$" --format '{{.Names}}' | grep -Fxq "${PROXY_CONTAINER}"
}

stop_pid_file_process() {
  local pid_file="$1"
  if [[ ! -f "$pid_file" ]]; then
    return 0
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if is_pid_running "$pid"; then
    kill "$pid" 2>/dev/null || true
    local deadline=$((SECONDS + 10))
    while is_pid_running "$pid" && (( SECONDS < deadline )); do
      sleep 1
    done
    if is_pid_running "$pid"; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi

  rm -f "$pid_file"
}

start_port_forward() {
  local url="$1"
  local pid_file="$2"
  local log_file="$3"
  shift 3

  if is_http_ready "$url"; then
    return 0
  fi

  if [[ -f "$pid_file" ]]; then
    local existing_pid
    existing_pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
      local deadline=$((SECONDS + 20))
      while (( SECONDS < deadline )); do
        if is_http_ready "$url"; then
          return 0
        fi
        sleep 1
      done
    fi
    rm -f "$pid_file"
  fi

  nohup "$@" >"$log_file" 2>&1 &
  local pid=$!
  echo "$pid" >"$pid_file"

  local deadline=$((SECONDS + 30))
  while (( SECONDS < deadline )); do
    if is_http_ready "$url"; then
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "Port-forward failed: $*" >&2
      [[ -f "$log_file" ]] && tail -n 50 "$log_file" >&2 || true
      return 1
    fi
    sleep 1
  done

  echo "Timed out waiting for ${url}" >&2
  return 1
}

ensure_port_forward() {
  local url="$1"
  local pid_file="$2"
  local log_file="$3"
  shift 3

  local existing_pid=""
  if [[ -f "$pid_file" ]]; then
    existing_pid="$(cat "$pid_file" 2>/dev/null || true)"
  fi

  if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null && is_http_ready "$url"; then
    return 0
  fi

  rm -f "$pid_file"
  start_port_forward "$url" "$pid_file" "$log_file" "$@"
}

start_proxy() {
  docker rm -f "${PROXY_CONTAINER}" >/dev/null 2>&1 || true
  docker run -d --restart unless-stopped --name "${PROXY_CONTAINER}" -p 80:80 \
    -v "${NGINX_CONF}:/etc/nginx/conf.d/default.conf:ro" \
    nginx:alpine >/dev/null
}

ensure_proxy() {
  if is_proxy_running; then
    return 0
  fi
  start_proxy
}

stop_proxy() {
  docker rm -f "${PROXY_CONTAINER}" >/dev/null 2>&1 || true
}

show_logs() {
  local printed=0
  for log_file in "${MONITOR_LOG}" "${UI_LOG}" "${API_LOG}"; do
    if [[ -f "$log_file" ]]; then
      printed=1
      echo "===== ${log_file##*/} ====="
      tail -n 40 "$log_file"
      echo
    fi
  done

  if [[ "$printed" -eq 0 ]]; then
    echo "No bridge logs found in ${STATE_DIR}."
  fi
}

show_status() {
  local ui_state="stopped"
  local api_state="stopped"
  local monitor_state="stopped"
  local proxy_state="stopped"

  local ui_pid=""
  local api_pid=""
  local monitor_pid=""

  if [[ -f "${UI_PID_FILE}" ]]; then
    ui_pid="$(cat "${UI_PID_FILE}" 2>/dev/null || true)"
    if is_pid_running "$ui_pid" && is_http_ready "http://127.0.0.1:${UI_PORT}"; then
      ui_state="running"
    elif is_pid_running "$ui_pid"; then
      ui_state="pid-alive-unhealthy"
    else
      ui_state="stale-pid"
    fi
  fi

  if [[ -f "${API_PID_FILE}" ]]; then
    api_pid="$(cat "${API_PID_FILE}" 2>/dev/null || true)"
    if is_pid_running "$api_pid" && is_http_ready "http://127.0.0.1:${API_PORT}/health"; then
      api_state="running"
    elif is_pid_running "$api_pid"; then
      api_state="pid-alive-unhealthy"
    else
      api_state="stale-pid"
    fi
  fi

  if [[ -f "${MONITOR_PID_FILE}" ]]; then
    monitor_pid="$(cat "${MONITOR_PID_FILE}" 2>/dev/null || true)"
    if is_pid_running "$monitor_pid"; then
      monitor_state="running"
    else
      monitor_state="stale-pid"
    fi
  fi

  if is_proxy_running; then
    proxy_state="running"
  fi

  echo "Host: http://${HOST_NAME}"
  echo "Monitor: ${monitor_state}${monitor_pid:+ (pid ${monitor_pid})}"
  echo "UI port-forward: ${ui_state}${ui_pid:+ (pid ${ui_pid})}"
  echo "API port-forward: ${api_state}${api_pid:+ (pid ${api_pid})}"
  echo "Proxy container: ${proxy_state}"

  if is_http_ready_get "http://127.0.0.1/api/auth/providers?workspace=default" "${READY_HOST_HEADER}"; then
    echo "Readiness: ready"
  else
    echo "Readiness: not ready"
  fi
}

stop_bridge() {
  stop_pid_file_process "${MONITOR_PID_FILE}"
  stop_pid_file_process "${UI_PID_FILE}"
  stop_pid_file_process "${API_PID_FILE}"
  stop_proxy
  echo "Stopped local OAO bridge for http://${HOST_NAME}"
}

start_bridge() {
  ensure_port_forward "http://127.0.0.1:${UI_PORT}" "${UI_PID_FILE}" "${UI_LOG}" \
    kubectl -n "${NAMESPACE}" port-forward "${UI_RESOURCE}" "${UI_PORT}:${UI_PORT}"

  ensure_port_forward "http://127.0.0.1:${API_PORT}/health" "${API_PID_FILE}" "${API_LOG}" \
    kubectl -n "${NAMESPACE}" port-forward "${API_RESOURCE}" "${API_PORT}:${API_PORT}"

  ensure_proxy
  wait_for_bridge_ready || true
  ensure_monitor_daemon
}

wait_for_bridge_ready() {
  local deadline=$(( $(date +%s) + 20 ))
  while (( $(date +%s) < deadline )); do
    ensure_port_forward "http://127.0.0.1:${UI_PORT}" "${UI_PID_FILE}" "${UI_LOG}" \
      kubectl -n "${NAMESPACE}" port-forward "${UI_RESOURCE}" "${UI_PORT}:${UI_PORT}"
    ensure_port_forward "http://127.0.0.1:${API_PORT}/health" "${API_PID_FILE}" "${API_LOG}" \
      kubectl -n "${NAMESPACE}" port-forward "${API_RESOURCE}" "${API_PORT}:${API_PORT}"
    ensure_proxy
    if is_http_ready_get "http://127.0.0.1/api/auth/providers?workspace=default" "${READY_HOST_HEADER}"; then
      echo "Local OAO access ready at http://${HOST_NAME}"
      return 0
    fi
    sleep 1
  done

  echo "Warning: local OAO bridge started, but readiness probe for ${READY_URL} did not succeed before timeout." >&2
  echo "Verify manually with: curl http://${HOST_NAME}/api/auth/providers?workspace=default" >&2
  return 1
}

monitor_bridge() {
  while true; do
    ensure_port_forward "http://127.0.0.1:${UI_PORT}" "${UI_PID_FILE}" "${UI_LOG}" \
      kubectl -n "${NAMESPACE}" port-forward "${UI_RESOURCE}" "${UI_PORT}:${UI_PORT}" || true
    ensure_port_forward "http://127.0.0.1:${API_PORT}/health" "${API_PID_FILE}" "${API_LOG}" \
      kubectl -n "${NAMESPACE}" port-forward "${API_RESOURCE}" "${API_PORT}:${API_PORT}" || true
    ensure_proxy || true
    sleep "${MONITOR_INTERVAL_SECONDS}"
  done
}

ensure_monitor_daemon() {
  local existing_pid=""
  if [[ -f "${MONITOR_PID_FILE}" ]]; then
    existing_pid="$(cat "${MONITOR_PID_FILE}" 2>/dev/null || true)"
  fi

  if is_pid_running "$existing_pid"; then
    return 0
  fi

  rm -f "${MONITOR_PID_FILE}"
  nohup bash "$0" --monitor >"${MONITOR_LOG}" 2>&1 &
  local monitor_pid=$!
  echo "$monitor_pid" >"${MONITOR_PID_FILE}"
}

cat >"${NGINX_CONF}" <<EOF
server {
  listen 80;
  server_name ${HOST_NAME};

  location /api/ {
    proxy_pass http://host.docker.internal:${API_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location / {
    proxy_pass http://host.docker.internal:${UI_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF

if [[ "${1:-}" == "--monitor" ]]; then
  monitor_bridge
  exit 0
fi

case "${1:-start}" in
  start)
    start_bridge
    ;;
  stop)
    stop_bridge
    ;;
  restart)
    stop_bridge
    start_bridge
    ;;
  status)
    show_status
    ;;
  logs)
    show_logs
    ;;
  -h|--help|help)
    print_usage
    ;;
  *)
    print_usage >&2
    exit 1
    ;;
esac

exit 0