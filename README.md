# pd-tinder

Structured applicant review for selection rounds. Round-one verdicts filter who
advances to round two; the analytics output serves the PD (professional
development) team. Built with SvelteKit + SQLite (better-sqlite3, WAL) and
drizzle ORM.

![CI](https://github.com/shagrirse/pd-tinder/actions/workflows/ci.yml/badge.svg)

## Features

- Invite-based sign-up with scrypt password hashing; admin bootstrapping
- Blind review: reviewers see anonymised applicants and claim cards from a
  shared deck; verdicts per applicant
- Round-one verdicts filter who advances to round two
- CSV import of application responses; cycle export for record-keeping
- Live smoke suite for deployed sites

## Quickstart

Requires Node >= 22.

```bash
npm install
cp .env.example .env   # no secrets needed for local development
npm run dev            # http://localhost:5173
npm run check && npm test
```

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — development workflow, releases, and the
  maintainer handover (start here)
- [deploy/RUNBOOK.md](deploy/RUNBOOK.md) — deploy, rollback, restore drill,
  dormancy (frozen historical record of the torn-down deployment; not maintained)
- [docs/teardown-runbook.md](docs/teardown-runbook.md) — context-agnostic
  teardown procedure, written from the 2026-08-27 run (the living procedure)

## Docs maintenance

[deploy/RUNBOOK.md](deploy/RUNBOOK.md) is frozen: the historical record of a deployment that no longer exists — nothing maintains it, and a rebuild would start a fresh runbook from it. [docs/teardown-runbook.md](docs/teardown-runbook.md) is the living procedure: **if a change's blast radius touches what it describes** — deploy scripts, Terraform resources, backup layout, ECR, DNS, env config, or the teardown steps — update it in the same change. Git history is the changelog for both.

## Status

The AWS deployment was torn down on 2026-08-27; the production database was
preserved locally in `backups/2026-08-27/` (gitignored). IaC sources remain in
`terraform/` as documentation.

## License

[MIT](LICENSE)
