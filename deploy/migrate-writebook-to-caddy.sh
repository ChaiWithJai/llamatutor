#!/usr/bin/env bash
set -Eeuo pipefail

voice_env="/opt/llamatutor/.env.voice.staging"
caddy_source="/opt/llamatutor/Caddyfile.voice-pilot"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="/root/writebook-pre-caddy-${stamp}"
old_container="writebook-pre-caddy-${stamp}"
transitioned="false"

[[ "$(id -u)" == "0" ]] || { echo "Run as root." >&2; exit 2; }
[[ -f "${voice_env}" && -f "${caddy_source}" ]] || {
  echo "Voice environment or Caddyfile is missing." >&2
  exit 2
}
docker inspect writebook >/dev/null
curl --fail --silent http://127.0.0.1:3201/healthz >/dev/null

install -d -m 700 "${backup_dir}"
docker inspect writebook > "${backup_dir}/container-inspect.json"
docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' writebook \
  > "${backup_dir}/writebook.env"
chmod 600 "${backup_dir}"/*
image="$(docker inspect --format '{{.Config.Image}}' writebook)"
volume_name="$(docker inspect --format '{{(index .Mounts 0).Name}}' writebook)"
volume_source="$(docker volume inspect "${volume_name}" | jq -r '.[0].Options.device // .[0].Mountpoint')"
[[ -d "${volume_source}" ]] || { echo "Writebook volume source is missing." >&2; exit 2; }

voice_secret="$(sed -n 's/^VOICE_WORKER_SHARED_SECRET=//p' "${voice_env}")"
[[ "${#voice_secret}" -ge 32 ]] || { echo "Voice secret is invalid." >&2; exit 2; }
install -m 600 /dev/null /etc/caddy/llamatutor.env
printf 'VOICE_WORKER_SHARED_SECRET=%s\n' "${voice_secret}" > /etc/caddy/llamatutor.env
install -m 644 "${caddy_source}" /etc/caddy/Caddyfile
install -d -m 755 /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironmentFile=/etc/caddy/llamatutor.env\n' \
  > /etc/systemd/system/caddy.service.d/llamatutor.conf
systemctl daemon-reload
VOICE_WORKER_SHARED_SECRET="${voice_secret}" caddy validate --config /etc/caddy/Caddyfile

rollback() {
  if [[ "${transitioned}" != "true" ]]; then return; fi
  systemctl stop caddy || true
  docker rm -f writebook >/dev/null 2>&1 || true
  docker rename "${old_container}" writebook >/dev/null 2>&1 || true
  docker start writebook >/dev/null 2>&1 || true
  echo "Caddy cutover failed; original Writebook container restored." >&2
}
trap rollback ERR

docker stop writebook >/dev/null
docker rename writebook "${old_container}"
transitioned="true"
tar -C "${volume_source}" -czf \
  "${backup_dir}/writebook-data.tar.gz" .
chmod 600 "${backup_dir}/writebook-data.tar.gz"
[[ "$(stat -c %s "${backup_dir}/writebook-data.tar.gz")" -gt 1000000 ]]
tar -tzf "${backup_dir}/writebook-data.tar.gz" >/dev/null

docker run -d \
  --name writebook \
  --restart unless-stopped \
  --env-file "${backup_dir}/writebook.env" \
  --mount source="${volume_name}",target=/rails/storage \
  -p 127.0.0.1:3080:3000 \
  "${image}" >/dev/null

for _ in $(seq 1 30); do
  curl --fail --silent --location http://127.0.0.1:3080 >/dev/null && break
  sleep 1
done
curl --fail --silent --location http://127.0.0.1:3080 >/dev/null
systemctl enable --now caddy

for _ in $(seq 1 45); do
  if curl --fail --silent --location https://grow.chaiwithjai.com >/dev/null \
    && curl --fail --silent --location https://book.chaiwithjai.com >/dev/null \
    && curl --fail --silent --location \
      -H "Authorization: Bearer ${voice_secret}" \
      https://voice-staging.dharmicdata.org/healthz >/dev/null; then
    transitioned="false"
    trap - ERR
    echo "Caddy cutover complete; rollback container: ${old_container}"
    exit 0
  fi
  sleep 2
done

echo "External verification failed." >&2
false
