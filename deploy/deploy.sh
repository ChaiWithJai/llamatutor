#!/usr/bin/env bash
set -Eeuo pipefail

target="${1:-}"
image_ref="${2:-}"
deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compose_file="${COMPOSE_FILE:-${deploy_dir}/compose.yml}"

case "${target}" in
  production)
    health_port="3100"
    ;;
  staging)
    health_port="3101"
    ;;
  *)
    echo "Usage: $0 <staging|production> <ghcr-image:tag>" >&2
    exit 2
    ;;
esac

if [[ ! "${image_ref}" =~ ^ghcr\.io/[A-Za-z0-9._/-]+:[A-Za-z0-9._-]+$ ]]; then
  echo "The image must be a tagged ghcr.io reference." >&2
  exit 2
fi

local_tag="llamatutor:${target}"
rollback_tag="llamatutor:rollback-${target}"
had_previous_image="false"

if docker image inspect "${local_tag}" >/dev/null 2>&1; then
  docker tag "${local_tag}" "${rollback_tag}"
  had_previous_image="true"
fi

docker pull "${image_ref}"
docker tag "${image_ref}" "${local_tag}"
docker compose -f "${compose_file}" up -d --no-deps --force-recreate "${target}"

healthy="false"
for _ in $(seq 1 30); do
  if curl --fail --silent "http://127.0.0.1:${health_port}/api/health" >/dev/null; then
    healthy="true"
    break
  fi
  sleep 2
done

if [[ "${healthy}" == "true" ]]; then
  echo "Deployed ${image_ref} to ${target}."
  exit 0
fi

echo "Health check failed for ${target}; rolling back." >&2
docker logs --tail 100 "llamatutor-${target}" >&2 || true

if [[ "${had_previous_image}" == "true" ]]; then
  docker tag "${rollback_tag}" "${local_tag}"
  docker compose -f "${compose_file}" up -d --no-deps --force-recreate "${target}"
else
  docker compose -f "${compose_file}" stop "${target}"
fi

exit 1
