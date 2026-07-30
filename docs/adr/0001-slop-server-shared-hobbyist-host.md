# ADR 0001: A bounded “slop-server” for hobbyist applications

- Status: proposed
- Date: 2026-07-29
- Decision owner: Jai Bhagat
- Review date: 2026-10-29

## Context

The existing DigitalOcean `writebook` Droplet has 2 vCPU, 4 GB RAM, and a
25 GB disk. At inspection time it had approximately 2.3 GB of available memory
and 15 GB of free disk after unused Docker build cache was removed. Its current
`writebook` container used approximately 409 MB of memory.

Llama Tutor performs model inference through Together AI and source retrieval
through Exa. The Droplet would run only the Next.js application, not an LLM.
Two resource-limited Llama Tutor containers therefore fit within current
capacity.

The proposed analogy is a personal “slop-server,” similar in spirit to a shared
“slop-db” on PlanetScale: one inexpensive substrate for experiments that do not
yet justify dedicated infrastructure.

The analogy has a hard limit. PlanetScale operates the database control plane,
durability, patching, and service recovery. A Droplet is an unmanaged virtual
machine. On the Droplet, the owner is the platform team, security team, on-call
engineer, and disaster-recovery operator. Logical separation between containers
does not create fault-domain separation.

## Decision

Adopt the existing Droplet as a **bounded shared hobbyist application host**.
“Slop-server” is the internal nickname, but “disposable compute, durable data”
is the operating rule.

The server is appropriate for:

- personal and pre-revenue web applications;
- prototypes, demos, internal tools, and low-traffic public projects;
- stateless or reconstructable application containers;
- applications whose durable state lives in a managed external system;
- workloads that can tolerate a four-hour recovery target and up to one day of
  configuration loss.

The server is not appropriate for:

- PHI, regulated data, payment-card data, or sensitive client records;
- a database whose only durable copy is a Docker volume on this host;
- contractual uptime, enterprise SLAs, or revenue-critical workflows;
- local model inference or sustained compute-heavy work;
- applications where staging must be an independent disaster-recovery test;
- workloads whose failure could create irreversible financial or reputational
  damage.

Llama Tutor staging and production may initially run on this server because the
application is stateless, inference is external, and the current consequences
of downtime are tolerable. This is a consciously accepted shared failure
domain, not a claim of high availability.

## Architecture boundary

```text
Internet
   |
DNS
   |
Caddy (only public listener on 80/443)
   |-----------------------|-----------------------|
writebook              tutor production        tutor staging
127.0.0.1:3080         127.0.0.1:3100          127.0.0.1:3101
                                                basic auth

Durable state and expensive capabilities stay off-host:
PlanetScale / managed database, Upstash, object storage, Together AI, Exa
```

Each application must have:

- one source repository and reproducible Dockerfile;
- an immutable registry image tagged by commit;
- a Compose service with CPU and memory limits;
- a loopback-only application port;
- an HTTP health endpoint;
- a restart policy;
- a health-checked deployment with automatic rollback;
- externally stored secrets, never committed to an image or repository;
- a named owner, public domain, port allocation, resource budget, and recovery
  procedure;
- an explicit expiry or review date.

No application may privately become infrastructure for another application.
Shared capabilities belong in managed services or must be promoted into an
explicitly operated platform component.

## The Munger checklist

These are operating heuristics inspired by Charlie Munger’s decision-making
principles, not claims that he prescribed server architecture.

### 1. Invert: how would we make this fail catastrophically?

We would:

- bind every container directly to the internet;
- keep the only database copy in an unnamed local volume;
- run without backups, monitoring, resource limits, or restore tests;
- let disk fill with build cache and logs;
- deploy mutable `latest` images with no rollback;
- give every workflow root SSH credentials;
- call shared staging “validation” even though it shares production’s host;
- wait for an outage before deciding when to migrate.

The operating rules below prohibit those conditions.

### 2. Avoid ruin

Cheap infrastructure is valuable only while its failure is survivable.

- Durable data must remain off-host or have a tested off-host backup.
- A Droplet loss must be recoverable from repositories, registry images,
  protected environment files, DNS records, and documented commands.
- No single hobby project may exhaust the host or expose another project’s
  credentials.
- Root access is exceptional. CI should use a constrained deploy user with only
  the permissions required to update its services.

If a failure can end the project, damage a client, or create an unbounded bill,
the workload has outgrown the slop-server even when CPU usage is low.

### 3. Demand a margin of safety

Capacity is governed by headroom, not by whether another container can start.

- Keep steady-state memory below 60% of physical RAM.
- Alert at 75% memory and migrate or resize before sustained use reaches 85%.
- Keep the root disk below 70%; alert at 75%; stop deployments at 85%.
- Keep sustained CPU below 60%; investigate ten-minute periods above 80%.
- Add 1–2 GB of swap as an emergency buffer, not planned capacity.
- Cap production Llama Tutor at 768 MB / 0.75 CPU.
- Cap staging Llama Tutor at 512 MB / 0.50 CPU.

New services need a written budget. “It probably fits” is not a budget.

### 4. Watch for lollapalooza effects

The dangerous event is rarely one isolated defect. A traffic spike, retry
storm, noisy staging deploy, full disk, expired certificate, and absent alerting
can reinforce one another.

Controls therefore span layers:

- Caddy owns ingress and TLS;
- rate limiting constrains paid API calls;
- container limits constrain noisy neighbors;
- disk and memory alerts expose host pressure;
- immutable images and health checks make rollback deterministic;
- off-host uptime checks detect loss of the whole server;
- spending alerts detect failures that infrastructure metrics cannot see.

### 5. Follow incentives

A frictionless shared server rewards adding projects and discourages removing
them. Counter that incentive:

- every service has an owner and quarterly review date;
- unused services are stopped, then removed after a documented grace period;
- abandoned domains, images, environment files, and volumes are inventoried;
- the cost dashboard allocates API and hosting spend by application;
- production approval remains manual even when staging deployment is automatic.

### 6. Stay inside the circle of competence

Prefer boring components the owner can restore while tired:

- Ubuntu LTS, Docker, Compose, Caddy, SSH, GHCR, and managed external services;
- one ingress pattern and one deployment pattern;
- no home-grown scheduler, cluster manager, secret store, or database control
  plane;
- no Kubernetes merely to make a single Droplet appear more sophisticated.

Complexity that cannot be restored from the runbook is a liability.

### 7. Precommit before emotion arrives

Migration criteria are decided now, before a launch, customer, or viral spike
makes delay attractive.

## Guardrails required before public production

1. Take a snapshot and enable automated Droplet backups.
2. Prove a restore onto a replacement Droplet at least once.
3. Enable a DigitalOcean Cloud Firewall and host firewall for SSH, HTTP, and
   HTTPS only.
4. Disable SSH password authentication and routine root login.
5. Add emergency swap.
6. Put Caddy in front of all services; bind application ports to loopback.
7. Configure CPU, memory, disk, uptime, certificate, and paid-API spend alerts.
8. Require Upstash rate limiting for public Llama Tutor traffic.
9. Protect staging with authentication and use synthetic data only.
10. Store a redacted service inventory and recovery runbook off-host.
11. Exercise application rollback and host rebuild procedures.
12. Record RTO, RPO, owner, and migration trigger for every production service.

Until these are true, the Droplet is a development host, not even
“production-lite.”

## Service-level expectations

The slop-server offers intentionally modest expectations:

| Property                 | Initial expectation                               |
| ------------------------ | ------------------------------------------------- |
| Availability             | Best effort; target 99%, not an SLA               |
| Recovery time objective  | 4 hours                                           |
| Recovery point objective | 24 hours for host configuration                   |
| Deployment               | Immutable image, health check, automatic rollback |
| Staging isolation        | Logical only; not a separate failure domain       |
| Data durability          | Managed off-host system or tested off-host backup |
| Support                  | Owner-operated, no 24/7 on-call                   |

Users and collaborators must not infer enterprise reliability from a polished
domain or TLS certificate.

## Migration triggers

Move a production application to its own Droplet or a managed platform when any
one of these becomes true:

- it receives paying customers or a contractual uptime expectation;
- downtime blocks another person’s work or creates meaningful reputational
  harm;
- it stores data that cannot be reconstructed;
- its steady-state usage exceeds 25% of host RAM or CPU;
- aggregate host memory exceeds 60% for seven days;
- disk remains above 70% after safe cleanup;
- staging activity measurably degrades production;
- releases queue or require coordination between unrelated applications;
- a service needs independent scaling, region choice, or network policy;
- the host contains more than five active public applications;
- recovery is not successfully rehearsed during the quarterly review;
- the owner feels reluctant to reboot or rebuild the server.

The last trigger is deliberately qualitative: fear of touching the host is
evidence that its responsibilities have become too concentrated.

## Consequences

### Positive

- One low fixed cost supports several experiments.
- Deployments remain fast enough for hobby work.
- The shared pattern creates reusable operational knowledge.
- Stateless services can be promoted without application rewrites.
- Explicit limits prevent premature platform engineering.

### Negative

- Every hosted application shares maintenance windows and outages.
- Staging cannot prove resilience to host-level failure.
- The owner carries patching, security, monitoring, backup, and recovery work.
- One compromised container or deploy credential can increase risk to peers.
- Capacity planning and cleanup become recurring chores.
- A polished production URL may create expectations the architecture cannot
  meet.

## Alternatives considered

### Separate Droplet per application

Better isolation and clearer cost attribution, but too much fixed cost and
operational repetition for the current hobbyist phase.

### Managed application platform for every project

Better deployment isolation, TLS, and scaling. It trades server maintenance for
platform cost, quotas, and provider-specific behavior. This becomes preferred
when an application crosses a migration trigger.

### Keep only staging on the shared Droplet

Safer for production, but duplicates infrastructure before Llama Tutor has
traffic or durability requirements that justify it. This is the default next
step when production first outgrows the shared host.

### Kubernetes on the current Droplet

Rejected. It increases operational surface without creating a second machine,
failure domain, or operator.

## Validation and review

Before changing this ADR to `accepted`:

- all “Guardrails required before public production” are evidenced;
- `writebook` is confirmed healthy behind the common ingress;
- Llama Tutor staging and production pass external health checks;
- a backup restore and an application rollback are demonstrated;
- the service inventory and quarterly review owner exist.

Review this decision quarterly and after every severity-one host incident.
Record threshold breaches and migrations as follow-up ADRs rather than silently
editing the rationale after the fact.
