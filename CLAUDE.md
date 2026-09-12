# CLAUDE.md

pd-tinder — SvelteKit app for structured applicant review in selection rounds (round-one verdicts filter round two; analytics serve the PD team). **The AWS deployment was torn down on 2026-08-27**: this repo is local development plus retained IaC/ops documentation.

## Commands

- `npm install` — dependencies
- `npm run dev` — Vite dev server
- `npm run check` — svelte-kit sync + svelte-check
- `npm test` — vitest
- `npm run test:e2e` — Playwright e2e suite
- `npm run smoke` — live smoke suite against a deployed site (needs `SMOKE_BASE_URL`, `SMOKE_ADMIN_EMAIL`, `SMOKE_ADMIN_PASSWORD`)
- `npm run db:generate` — drizzle-kit migrations

## Architecture

- SvelteKit (adapter-node) with SQLite via better-sqlite3 in WAL mode, drizzle ORM; migrations in `drizzle/`.
- Deployment (historical): t3.micro EC2 + EBS data volume at `/srv/pdtinder/data`, Caddy + app + Litestream containers via docker compose (`deploy/`), images pushed to ECR by `scripts/deploy.sh`, SSM-only access (no SSH). All destroyed; `terraform/` sources retained as documentation — its S3 backend bucket is gone, so terraform commands on the root module fail; that is expected.

## Gotchas

- `*.csv` at the repo root contains applicant PII — never commit (only `tests/fixtures/*.csv`).
- `backups/` (gitignored) holds the only remaining copy of production data.
- `.env` holds secrets; `.env.example` is the template.
- `docs/superpowers/` is a local brainstorming/spec working directory.

## Runbook maintenance rule

`deploy/RUNBOOK.md` is frozen: a historical record of the torn-down deployment, not maintained (a rebuild would start a fresh runbook from it). `docs/teardown-runbook.md` is the living procedure: **if a change's blast radius touches what it describes** — deploy scripts, Terraform resources, backup layout, ECR, DNS, env config, or the teardown steps — update it in the same change. Canonical statement: `README.md` → "Docs maintenance".

## Development workflow

- Issue-first: every change starts as a GitHub issue; branch names are
  `<type>/<slug>` where type is one of `feat`, `fix`, `hotfix`,
  `chore`, `docs`. The issue is referenced from the PR, not the branch name.
- PRs need one approving review and squash-merge; the PR title (conventional
  commit) becomes the commit on `main`.
- Releases are calendar-versioned tags (`v2027.1`) cut before each recruitment
  cycle (June mentors → ~September mentees); hotfixes branch off the tag.
- Full procedure: `CONTRIBUTING.md` — the handover document for future batches.
