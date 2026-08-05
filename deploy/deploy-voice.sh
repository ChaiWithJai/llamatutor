#!/usr/bin/env bash
set -Eeuo pipefail

target="${1:-}"
image_ref="${2:-}"
deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compose_file="${COMPOSE_FILE:-${deploy_dir}/compose.yml}"

case "${target}" in
  production)
    health_ports=("3200" "3202")
    services=("voice-production" "voice-daily-production")
    ;;
  staging)
    health_ports=("3201" "3203")
    services=("voice-staging" "voice-daily-staging")
    ;;
  *) echo "Usage: $0 <staging|production> <ghcr-image@sha256:digest>" >&2; exit 2 ;;
esac

if [[ ! "${image_ref}" =~ ^ghcr\.io/[A-Za-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]]; then
  echo "The image must be a pinned ghcr.io digest." >&2
  exit 2
fi

local_tag="llamatutor-voice:${target}"
rollback_tag="llamatutor-voice:rollback-${target}"
had_previous="false"
if docker image inspect "${local_tag}" >/dev/null 2>&1; then
  docker tag "${local_tag}" "${rollback_tag}"
  had_previous="true"
fi

docker pull "${image_ref}"
docker tag "${image_ref}" "${local_tag}"
docker compose -f "${compose_file}" up -d --no-deps --force-recreate "${services[@]}"

all_ready="false"
for _ in $(seq 1 45); do
  all_ready="true"
  for health_port in "${health_ports[@]}"; do
    if ! curl --fail --silent "http://127.0.0.1:${health_port}/healthz" >/dev/null; then
      all_ready="false"
      break
    fi
  done
  [[ "${all_ready}" == "true" ]] && break
  sleep 2
done

if [[ "${all_ready}" == "true" ]]; then
  echo "Deployed ${image_ref} to ${services[*]}."
  exit 0
fi

for service in "${services[@]}"; do
  docker logs --tail 100 "llamatutor-${service}" >&2 || true
done
if [[ "${had_previous}" == "true" ]]; then
  docker tag "${rollback_tag}" "${local_tag}"
  docker compose -f "${compose_file}" up -d --no-deps --force-recreate "${services[@]}"
else
  docker compose -f "${compose_file}" stop "${services[@]}"
fi
echo "Voice health check failed; rollback applied." >&2
exit 1
