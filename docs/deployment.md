# Llama Tutor deployment

## Active recommendation: Netlify

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

Required Netlify environment variables:

```dotenv
TOGETHER_API_KEY=
EXA_API_KEY=
```

Optional variables:

```dotenv
TOGETHER_MULTIMODAL_MODEL=
HELICONE_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

The release path is:

- Pull request: GitHub CI plus a Netlify Deploy Preview with an isolated
  database branch.
- `main`: production deploy to `tutor.dharmicdata.org` and the production
  database.
- Emergency manual review deploy: `netlify deploy --context deploy-preview`.
- Emergency manual production deploy: `netlify deploy --prod`.

The Netlify project must be connected to `ChaiWithJai/llamatutor` with `main`
as its production branch.

Run `pnpm check && pnpm test:e2e` before promotion, then verify `/api/health`,
one source search, one initial lesson, sign-up/sign-in, one completed practice
rep, resume after reload, data export, and data deletion on the deployed URL.

Database migrations live in `netlify/database/migrations`. Netlify applies
them during deploy. Never put `NETLIFY_DB_URL`, Identity admin credentials, or
provider keys in GitHub; Netlify injects them at runtime.

## Could the DigitalOcean Droplet host it?

Yes, but it is the fallback rather than the preferred production target. Llama
Tutor runs inference through Together AI, so the existing `writebook` Droplet's
2 vCPU and 4 GB RAM can host two small Next.js containers. It should not host
the model itself.

The reasons not to use it for this launch are operational:

- `writebook` already owns ports 80 and 443.
- Tutor would share one host, disk, network path, and maintenance window with
  an unrelated production service.
- The Droplet currently has no Cloud Firewall, backups, monitoring, or swap.
- TLS, reverse-proxy changes, rollback, and staging isolation would all become
  our responsibility.
- Netlify already manages the parent domain and sibling Dharmic Data sites.

The Docker, Compose, Caddy, and health-checked deployment files remain in this
repository for portability or a later migration.

## Droplet fallback

### Observed Droplet state (2026-07-29)

- Droplet: `writebook`, NYC1, Ubuntu 24.04
- Capacity: 2 vCPU, 4 GB RAM, 25 GB disk
- Available memory: approximately 2.3 GB
- Root disk after cleanup: 36% used, approximately 15 GB free
- Unused Docker build cache reclaimed during validation: 10.49 GB
- Existing workload: one `writebook` container, approximately 409 MB RAM
- No swap
- UFW inactive
- No DigitalOcean Cloud Firewall attached
- DigitalOcean backups and monitoring are not enabled
- `writebook` directly owns public ports 80 and 443

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

The application containers never bind directly to the public interface. Caddy
terminates TLS and routes by hostname.

### Droplet bootstrap

Create `/opt/llamatutor/.env.production` and
`/opt/llamatutor/.env.staging`, each readable only by root:

```dotenv
TOGETHER_API_KEY=
TOGETHER_MULTIMODAL_MODEL=
EXA_API_KEY=
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
