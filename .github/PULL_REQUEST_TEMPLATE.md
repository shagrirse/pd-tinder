<!-- The PR title is a conventional commit and becomes the commit on main
after squash-merge. -->

Closes #

## Checklist

- [ ] Tests added/updated; `npm run check` and `npm test` pass locally
- [ ] e2e run where the change touches a user flow (`npm run test:e2e`)
- [ ] If the change's blast radius touches what `docs/teardown-runbook.md`
      describes, it is updated in this PR
- [ ] No CSV, `.env`, or `backups/` content committed
