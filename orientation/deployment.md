# Deployment — ShipShape improved fork

The GFA Week 4 brief requires a deployed, publicly accessible URL of the improved fork as one of the submission deliverables.

## Status

🟢 **Deployed to a DigitalOcean droplet (Basic 2 GB, NYC1, Ubuntu 24.04).** URL below.

## Hosted URL

**http://143.198.163.184/** — Ship on a single $12/mo droplet. HTTP only (no TLS yet; certbot is installed and a domain can be wired up later via `certbot --nginx`).

## Health check / smoke test

```bash
# Backend health
curl -sf http://143.198.163.184/health
# → {"status":"ok"}

# Frontend smoke
curl -sI http://143.198.163.184/ | head -1
# → HTTP/1.1 200 OK

# API + CSRF works (proves api routing through nginx)
curl -s http://143.198.163.184/api/csrf-token | jq .token | head -c 32
```

## Why not AWS

Upstream Ship is configured for AWS (Elastic Beanstalk + Aurora Serverless + S3 + CloudFront + WAF + SSM + Secrets Manager — see `terraform/`). At idle this floor-cost is ~$110/mo. For a Gauntlet submission with demo-grade traffic, a single $12/mo DigitalOcean droplet is roughly 10× cheaper for the same observable behaviour. Trade-offs documented in the chat log this branch came from.

The `feat/droplet-deploy` branch adds one small code change to enable non-AWS deployments: `api/src/config/ssm.ts` now skips its AWS SSM call when `DATABASE_URL` + `SESSION_SECRET` are already populated in `process.env` (e.g. via systemd `EnvironmentFile`). AWS EB behaviour is unchanged — EB doesn't pre-set those vars and still falls through to SSM.

## Architecture on the droplet

```
                 ┌─ http :80 ─────────────────────────────────────┐
                 │  nginx (Ubuntu, /etc/nginx/sites-available/ship)│
                 │                                                 │
                 │  /                → static /opt/ship/current/web/dist
                 │  /assets/*        → static, cache-immutable
                 │  /api/*           → proxy localhost:3000
                 │  /collaboration/* → proxy localhost:3000 (WS)
                 │  /health          → proxy localhost:3000
                 └────────────┬───────────────────────────────────┘
                              │
                              ▼
           ┌─ systemd (ship-api.service, user=ship) ─┐
           │   node /opt/ship/current/api/dist/index.js
           │   EnvironmentFile=/etc/ship/env
           │   (DATABASE_URL, SESSION_SECRET, PORT, NODE_ENV)
           └──────────────────┬──────────────────────┘
                              │
                              ▼
                  Postgres 16 on localhost:5432
                  (db ship_main, user ship)
                  shared_buffers=512MB,
                  effective_cache_size=1.5GB
```

## Layout on disk

```
/opt/ship/
├── releases/
│   ├── 20260522-205057/        # original deploy
│   │   ├── api/                # dist + node_modules + package.json
│   │   └── web/dist/           # vite build output
│   └── <future timestamps>/
├── current → releases/20260522-205057/  # atomic symlink swap on deploy
└── shared/                     # reserved for per-deploy shared state

/etc/ship/env                   # 640 root:ship — DATABASE_URL + SESSION_SECRET + NODE_ENV + PORT
/etc/systemd/system/ship-api.service
/etc/nginx/sites-available/ship
```

## Deployment workflow

The runbook is automated. One command from a clean local checkout:

```bash
bash scripts/deploy-droplet.sh
```

(Or `./scripts/deploy-droplet.sh` once you've set the executable bit with `chmod +x`.)

What it does — see the script for the full pipeline; the headline steps:

1. `pnpm build` — build api, web, shared locally
2. `pnpm deploy --legacy --filter=@ship/api --prod` — produce a self-contained api bundle (`.deploy/ship-api-<ts>/`)
3. Strip non-runtime cruft (test files, coverage, `.env.local`, EB platform files)
4. `rsync` api bundle + `web/dist/` to `/opt/ship/releases/<ts>/`
5. SSH: swap `/opt/ship/current` symlink + `systemctl restart ship-api`
6. SSH: `curl /health` smoke test

`DROPLET_HOST` env var overrides the target (default `ship@143.198.163.184`).

Rollback: `ssh ship@<host> 'ls /opt/ship/releases/' → ln -sfn /opt/ship/releases/<earlier-ts> /opt/ship/current → sudo systemctl restart ship-api`. No data is lost; only the symlink moves.

## One-time bootstrap (already done; documented for reproducibility)

If standing up a new droplet from scratch:

```bash
# 0. Provision: DO Basic 2 GB, Ubuntu 24.04 LTS, US datacenter, add your SSH key.

# 1. System packages
apt-get update -qq
apt-get upgrade -y -qq
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs postgresql-16 postgresql-contrib nginx certbot python3-certbot-nginx fail2ban
corepack enable
corepack prepare pnpm@10.27.0 --activate

# 2. Deploy user
adduser --disabled-password --gecos "" ship
usermod -aG sudo ship
mkdir -p /home/ship/.ssh
cp /root/.ssh/authorized_keys /home/ship/.ssh/authorized_keys
chown -R ship:ship /home/ship/.ssh && chmod 700 /home/ship/.ssh && chmod 600 /home/ship/.ssh/authorized_keys
echo "ship ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/ship-nopasswd
chmod 440 /etc/sudoers.d/ship-nopasswd
mkdir -p /opt/ship/{releases,shared} && chown -R ship:ship /opt/ship

# 3. Postgres role + db (use a strong password, store in /etc/ship/env)
PG_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
sudo -u postgres psql -c "CREATE ROLE ship LOGIN PASSWORD '$PG_PASS' CREATEDB;"
sudo -u postgres createdb -O ship ship_main
# tune /etc/postgresql/16/main/postgresql.conf for 2 GB:
#   shared_buffers = 512MB
#   effective_cache_size = 1536MB
#   work_mem = 8MB
#   maintenance_work_mem = 128MB
#   max_connections = 50
#   wal_buffers = 16MB
#   random_page_cost = 1.1
systemctl restart postgresql

# 4. /etc/ship/env
SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')
mkdir -p /etc/ship
cat > /etc/ship/env <<EOF
DATABASE_URL=postgresql://ship:$PG_PASS@localhost:5432/ship_main
NODE_ENV=production
PORT=3000
SESSION_SECRET=$SESSION_SECRET
EOF
chown root:ship /etc/ship/env && chmod 640 /etc/ship/env

# 5. systemd unit + nginx site
#    (Contents inlined in scripts/deploy-droplet.sh — or see the existing /etc/systemd/system/ship-api.service
#     and /etc/nginx/sites-available/ship on the deployed droplet.)
systemctl enable ship-api
rm -f /etc/nginx/sites-enabled/default
ln -sfn /etc/nginx/sites-available/ship /etc/nginx/sites-enabled/ship
nginx -t

# 6. Firewall
ufw allow 22,80,443/tcp
ufw --force enable

# 7. First deploy (run from your laptop, not the droplet)
bash scripts/deploy-droplet.sh
```

## Migration check on the deployed Postgres

```bash
ssh ship@143.198.163.184 \
  'set -a; . /etc/ship/env; set +a; \
   PGPASSWORD=$(echo $DATABASE_URL | sed -E "s|.*://[^:]+:([^@]+)@.*|\1|") \
     psql -h localhost -U ship -d ship_main \
     -c "SELECT indexname FROM pg_indexes WHERE tablename='\''documents'\'' AND indexname LIKE '\''idx_documents_%'\'' ORDER BY indexname;"'
```

Should include the four Phase 2 / migration-038 indexes:
- `idx_documents_issue_state`
- `idx_documents_issue_assignee_id`
- `idx_documents_sprint_number`
- `idx_documents_project_owner_id`

## What graders should verify on the deployed instance

1. `GET http://143.198.163.184/health` returns `{"status":"ok"}`
2. `GET http://143.198.163.184/` returns the Ship index.html
3. The first-load JS bundle is **~142 KB gzipped** (matches the Cat 2 measurement)
4. The `/api/issues` query (after auth) hits the JSONB indexes, sub-50ms
5. The Yjs WebSocket connects at `/collaboration/{type}:{uuid}` (visible in DevTools → Network → WS)

## Demo notes

The deployed droplet starts with an empty database — no `pnpm db:seed` was run. The grader's first hit will land on `/setup`, the first-time admin setup flow. They can create the admin account there, then explore.

If you'd rather ship with the seed data identical to the Phase 2 benchmarks (35 weeks, 104 issues, 20+ projects, 257 documents), run on the droplet:

```bash
ssh ship@143.198.163.184 'set -a; . /etc/ship/env; set +a; \
  cd /opt/ship/current/api && node dist/db/seed.js'
```

## Tradeoffs taken on this deploy

- **HTTP only.** No TLS / certificate. certbot is installed; running `sudo certbot --nginx -d <domain>` would issue Let's Encrypt and rewrite nginx config. Needs a DNS record pointing at the IP first.
- **Single instance, no failover.** A box reboot causes ~30s of downtime. Adequate for demo; not for prod.
- **In-memory session store.** Express's default MemoryStore is non-persistent across api restarts and doesn't scale across processes. Fine for a one-pod demo; would need redis (or `connect-pg-simple`) for real prod.
- **Postgres co-located.** No managed DB, no automated backups beyond what you script. Acceptable at this scale; if data matters, swap in DO Managed Postgres ($15/mo) and point `DATABASE_URL` at it.
- **Root SSH still enabled.** The `ship` user has sudo and the same key; tightening sshd_config to disable root login is a one-line follow-up.
