# Llama Tutor deployment

## Active split: Netlify web, DigitalOcean voice

Production is served at `https://tutor.dharmicdata.org` on Netlify. This matches
the existing `dharmicdata.org` and `shakti.dharmicdata.org` hosting pattern.
Because the apex domain already uses Netlify DNS, assigning the Tutor subdomain
to its own Netlify project provides DNS routing, TLS, CDN delivery, deploy
previews, and function hosting without modifying the shared DigitalOcean
Droplet.

The application calls Exa and Together AI from server-side Next.js routes.
`netlify.toml` applies per-IP edge rate limits to both metered endpoints.
Netlify Identity handles learner accounts, and Netlify Database stores the
server-scoped coaching loop described in
`docs/adr/0002-option-b-netlify-identity-database.md`.

The live voice pilot is a separate Pipecat service on DigitalOcean. Netlify
creates sessions and reviews each completed caller turn; the worker handles
WebRTC, transcription, and speech. It cannot speak unless Netlify returns
`reviewed: true`. SmallWebRTC is the staging default, while the same image can
join a private Daily room. Exa is deliberately absent from this path.

Required Netlify environment variables:

```dotenv
TOGETHER_API_KEY=
EXA_API_KEY=
WOLFRAM_ALPHA_APP_ID=
VOICE_WORKER_URL=
VOICE_WORKER_SHARED_SECRET=
DAILY_API_KEY=
```

Optional variables:

```dotenv
TOGETHER_MULTIMODAL_MODEL=
HELICONE_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

`WOLFRAM_ALPHA_APP_ID` is required anywhere the Drill down action is exposed.
`HELICONE_API_KEY` is optional observability; the application works without
it. The Upstash variables are optional in the current Netlify deployment
because edge rate limits are defined in `netlify.toml`; they remain the
application-level rate-limit fallback for hosts that do not enforce those
rules.

The release path is:

- Pull request: GitHub CI plus a Netlify Deploy Preview with an isolated
  database branch.
- `main`: production deploy to `tutor.dharmicdata.org` and the production
  database.
- Emergency manual review deploy: `netlify deploy --context deploy-preview`.
- Emergency manual production deploy: `netlify deploy --prod`.

The Netlify project must be connected to `ChaiWithJai/llamatutor` with `main`
as its production branch.

Run `pnpm check && pnpm test:e2e` before promotion. Once the deploy is live,
run the non-mocked health and Wolfram configuration smoke check against the
actual URL:

```bash
pnpm verify:deployment -- https://deploy-preview-123--dharmic-data-tutor.netlify.app
```

The command fails if `/api/health` is unhealthy, if `/api/drilldown` reports
that `WOLFRAM_ALPHA_APP_ID` is missing, if a known computable query fails, or
if the voice control plane cannot health-check and start a WebRTC session.
Then verify one source search, one initial lesson, sign-up/sign-in, one
completed practice rep, resume after reload, data export, and data deletion on
the deployed URL.

Database migrations live in `netlify/database/migrations`. Netlify applies
them during deploy. Never put `NETLIFY_DB_URL`, Identity admin credentials, or
provider keys in GitHub; Netlify injects them at runtime.

## DigitalOcean voice pilot

Observed on 2026-08-05:

- `voice-staging.dharmicdata.org` terminates TLS in Caddy and requires the
  server-to-server bearer credential.
- The SmallWebRTC and Daily staging processes bind only to
  `127.0.0.1:3201` and `127.0.0.1:3203`; each is limited to 768 MB RAM and
  0.75 CPU. Caddy exposes the Daily process only under the authenticated
  `/daily/` path.
- SmallWebRTC uses Linux host networking for its ephemeral UDP media ports.
  Its HTTP listener still binds only to loopback. Daily uses Docker bridge
  networking.
- SmallWebRTC live media and a real private Daily room/token startup both
  passed from the same worker image. The final synthetic Chromium pass measured
  4.160 seconds to first audio, 3.508 seconds from caller stop to the reviewed
  reply, and 9 milliseconds to stop interrupted audio. A cold pass took 10.712
  seconds to first audio, so latency tuning remains open.
- Caddy now owns ports 80/443. Writebook remains healthy behind it on
  `127.0.0.1:3080`, with a validated pre-migration archive under `/root`.

The pilot is not a production promotion. Multi-turn trajectory evidence and a
Daily browser call remain promotion gates in ADR 0006. Daily room creation
works, but the account needs billing before a browser can join.

## Could the DigitalOcean Droplet host the web app too?

Yes, but it is the fallback rather than the preferred production target. Llama
Tutor runs inference through Together AI, so the existing `writebook` Droplet's
2 vCPU and 4 GB RAM can host two small Next.js containers. It should not host
the model itself.

The reasons not to move the web app there are operational:

- Writebook and the voice pilot already share the host behind Caddy.
- Tutor would share one host, disk, network path, and maintenance window with
  an unrelated production service.
- The Droplet currently has no Cloud Firewall, backups, monitoring, or swap.
- TLS, reverse-proxy changes, rollback, and staging isolation are our
  responsibility on this host.
- Netlify already manages the parent domain and sibling Dharmic Data sites.

The Docker, Compose, Caddy, and health-checked deployment files remain in this
repository for portability or a later migration.

## Droplet fallback

### Observed Droplet state (2026-08-05)

- Droplet: `writebook`, NYC1, Ubuntu 24.04
- Capacity: 2 vCPU, 4 GB RAM, 25 GB disk
- Available memory: approximately 2.3 GB
- Root disk after the voice image build: approximately 58% used, 9.8 GB free
- Unused Docker build cache reclaimed during validation: 10.49 GB
- Existing workloads: Writebook plus the staging voice worker
- No swap
- UFW inactive
- No DigitalOcean Cloud Firewall attached
- DigitalOcean backups and monitoring are not enabled
- Caddy owns public ports 80 and 443; workloads use loopback bindings

Before using the Droplet:

1. Schedule a short `writebook` routing maintenance window.
2. Take a Droplet snapshot or enable automated backups.
3. Add 1–2 GB swap as an emergency buffer; do not treat swap as capacity.
4. Enable the firewall and allow only SSH, HTTP, and HTTPS.
5. Install Caddy on the host and make it the only process that owns ports
   80/443.
6. Recreate `writebook` with its existing data volume and secrets, but publish
   Puma only on `127.0.0.1:3080:3000`.
7. Point the three DNS names at the Droplet and install `deploy/Caddyfile`.

### Runtime layout

| Service                | Host binding     | Public access                          |
| ---------------------- | ---------------- | -------------------------------------- |
| writebook              | `127.0.0.1:3080` | Existing writebook hostname            |
| Llama Tutor production | `127.0.0.1:3100` | Production hostname                    |
| Llama Tutor staging    | `127.0.0.1:3101` | Staging hostname, basic-auth protected |
| Voice production       | `127.0.0.1:3200` | Reserved SmallWebRTC process           |
| Voice staging          | `127.0.0.1:3201` | Authenticated SmallWebRTC process      |
| Daily production       | `127.0.0.1:3202` | Reserved `/daily/` process             |
| Daily staging          | `127.0.0.1:3203` | Authenticated `/daily/` process        |

The application containers never bind directly to the public interface. Caddy
terminates TLS and routes by hostname.

### Droplet bootstrap

Create `/opt/llamatutor/.env.production` and
`/opt/llamatutor/.env.staging`, each readable only by root:

```dotenv
TOGETHER_API_KEY=
TOGETHER_MULTIMODAL_MODEL=
EXA_API_KEY=
WOLFRAM_ALPHA_APP_ID=
HELICONE_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

`TOGETHER_API_KEY` and `EXA_API_KEY` are required. Helicone is optional. Upstash
is technically optional but should be treated as required for a public
deployment because it enforces the per-IP usage limit.

Log the Droplet into GHCR once using a GitHub token with package read access:

```bash
docker login ghcr.io
```

Copy `deploy/compose.yml` and `deploy/deploy.sh` into `/opt/llamatutor`.

For Caddy, create a protected systemd environment file with:

```dotenv
LLAMATUTOR_PRODUCTION_DOMAIN=tutor.example.com
LLAMATUTOR_STAGING_DOMAIN=staging-tutor.example.com
WRITEBOOK_DOMAIN=writebook.example.com
STAGING_BASIC_AUTH_USER=reviewer
STAGING_BASIC_AUTH_HASH=
```

Generate the password hash with `caddy hash-password`, validate the config with
`caddy validate`, and reload Caddy.

### GitHub environments and secrets

Create GitHub environments named `staging` and `production`. Require approval
for the production environment. Add these secrets to both:

- `DROPLET_HOST`
- `DROPLET_USER`
- `DROPLET_SSH_KEY`
- `DROPLET_KNOWN_HOSTS`

The Droplet workflow is manual-only while Netlify is the active host. Select
`staging` or `production` and choose the commit to run. It builds one immutable
image and promotes that image through the health-checked deployment script.

The deployment retains the previous local image tag. If `/api/health` does not
become healthy within 60 seconds, the script restores the previous container.

### Capacity guardrails

The Compose limits reserve at most 768 MB for production and 512 MB for
staging, leaving room for `writebook`, Docker, Caddy, and the operating system.
Add alerts before launch:

- host memory above 80%
- root disk above 80%
- CPU above 80% for 10 minutes
- external uptime failures for all production hostnames
- Together AI or Exa spend/rate anomalies

If production begins competing with `writebook`, move Llama Tutor production
to a second Droplet first; keep staging on the existing host.
