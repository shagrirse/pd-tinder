# pd-tinder

SvelteKit application for structured applicant review in selection rounds. Round-one verdicts filter who advances to round two; the analytics output serves the PD (professional development) team.

## Status

The AWS deployment was torn down on 2026-08-27; the production database was preserved locally in `backups/2026-08-27/` (gitignored). IaC sources remain in `terraform/` as documentation.

## Documentation

- [deploy/RUNBOOK.md](deploy/RUNBOOK.md) — deploy, rollback, restore drill, dormancy (frozen historical record of the torn-down deployment; not maintained)
- [docs/teardown-runbook.md](docs/teardown-runbook.md) — context-agnostic teardown procedure, written from the 2026-08-27 run (the living procedure)

## Docs maintenance

[deploy/RUNBOOK.md](deploy/RUNBOOK.md) is frozen: the historical record of a deployment that no longer exists — nothing maintains it, and a rebuild would start a fresh runbook from it. [docs/teardown-runbook.md](docs/teardown-runbook.md) is the living procedure: **if a change's blast radius touches what it describes** — deploy scripts, Terraform resources, backup layout, ECR, DNS, env config, or the teardown steps — update it in the same change. Git history is the changelog for both.

## Development

`npm install && npm run dev` — see `package.json` for the full script list (check, test, e2e, smoke, db:generate).
