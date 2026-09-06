# Contributing to pd-tinder

This document is the project's handover manual: everything a maintainer needs
to develop, review, release, and run a recruitment cycle. If you are joining a
future batch, start here.

## Development setup

Requires Node >= 22.

```bash
npm install
cp .env.example .env   # local-only secrets; never commit .env
npm run dev            # dev server
npm run check          # svelte-check type-check
npm test               # unit + integration tests
npm run db:generate   # drizzle-kit migrations
npm run test:e2e       # Playwright e2e (local; needs a running app)
npm run smoke          # live smoke suite (needs SMOKE_BASE_URL and admin credentials of a deployed site)
```

CSV files at the repo root contain applicant PII — never commit them
(`tests/fixtures/*.csv` are invented fixtures and are fine).

## Workflow

Issue-first. Every change starts as a GitHub issue; the PR references it with
`Closes #N`.

1. **Branch** from `main`: `<type>/<short-slug>`, where `type` is one
   of `feat`, `fix`, `hotfix`, `chore`, `docs`. Examples:
   `feat/weighted-scoring`, `fix/verdict-button`, `chore/upgrade-deps`.
2. **Commit** early and often on the branch.
3. **Open a PR** whose title is a conventional commit — after squash-merge,
   the PR title becomes the commit on `main`. Reference the issue with
   `Closes #12`.
4. **One approving review** is required (any other maintainer). The reviewer
   walks the PR checklist below.
5. **Squash-merge** and delete the branch.

`main` must stay in a working, releasable state. CI runs `npm run check` and
`npm test` on every PR; the e2e and smoke suites run locally because they need
a running app or a deployed site with credentials.

### Conventional commits

`feat:` new user-facing behaviour · `fix:` a bug fix · `docs:` documentation ·
`chore:` tooling or maintenance. The PR title's type matches the branch's type.

### PR checklist

- Tests added/updated for the change; `npm run check` and `npm test` pass locally.
- If the change's blast radius touches what `docs/teardown-runbook.md`
  describes — deploy scripts, Terraform resources, backup layout, ECR, DNS,
  env config, or the teardown steps — it is updated in the same change.
- No CSV, `.env`, or `backups/` content committed.

## Releases

The app runs one recruitment cycle per academic year: mentor recruitment in
June, mentee recruitment until ~September. Development happens September–May;
each cycle runs a tagged release.

**Cutting a cycle release (~2 weeks before the June round):**

1. Stabilise `main`: run the full local suite (`npm run check`, `npm test`,
   `npm run test:e2e`) and fix what is broken.
2. Tag and release:

   ```bash
   git checkout main && git pull
   git tag v2027.1
   git push origin v2027.1
   gh release create v2027.1 --generate-notes
   ```

   Versioning is calendar-based: `v<year>.<n>` (n resets each year); patches
   are `v<year>.<n>.<m>`. Release notes are generated from the conventional
   commits since the previous tag — there is no hand-maintained CHANGELOG.
3. Deploy the tag (the deployment docs in `deploy/` are historical; a rebuild
   starts a fresh runbook from them).

**Hotfixing a live cycle:**

1. Branch off the cycle's tag:

   ```bash
   git switch -c hotfix/verdict-crash v2027.1
   ```

2. Fix, test, commit, push.
3. Tag the patch and deploy it:

   ```bash
   git tag v2027.1.1 && git push origin v2027.1.1
   gh release create v2027.1.1 --generate-notes
   ```

4. Open a PR from the hotfix branch into `main` (review as usual) and
   squash-merge, so the fix is also in next year's code.

## Code layout

- `src/routes/` — SvelteKit pages: `login`, `invite/[token]`, `review/`,
  `results/`, `admin/`
- `src/lib/server/` — domain logic: `auth/` (sessions, invites, scrypt),
  `import/` (CSV parsing/normalising), `review/` (blind decks, claims,
  verdicts), `results/` (scoring, ranking, export), `db/` (schema and
  migrations via drizzle)
- `scripts/` — admin bootstrap, cycle creation, dev seeding, deploy
  (historical), smoke suite
- `tests/` — `unit/`, `integration/`, `e2e/`, fixtures
- `deploy/`, `terraform/` — retained IaC documentation of the torn-down
  deployment
- `drizzle/` — SQLite migrations

## Handover to the next batch

At the end of a cycle (~September):

1. Tag the cycle's final patch release.
2. Write up the cycle in a GitHub issue — what broke, what was slow, what to
   improve — so the next batch starts with notes instead of tribal knowledge.
3. Point new maintainers at this file, `README.md`, and `CLAUDE.md`.
4. Verify a fresh clone works for someone new: `npm install && npm run dev`
   and `npm test` on a clean checkout.
