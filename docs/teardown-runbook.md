# Infrastructure teardown runbook

A generic, project-agnostic procedure for tearing down a Terraform-managed AWS
deployment: compute + EBS + Elastic IP + DNS + versioned S3 backups + container
registry + IAM + the Terraform state bucket itself. Written from an actual run
(pd-tinder, 2026-08-27); every command uses `<PLACEHOLDERS>` and the concrete
values from that run are in [the mapping table](#placeholder--this-run-values).

**Maintenance:** this is the living procedure — the only maintained runbook.
Keep it current whenever a change's blast radius touches what it describes.
See `README.md` → "Docs maintenance".

## Ordering rules

The whole procedure hangs off four rules; everything else is detail.

1. **Data before destruction.** Every destructive command is irreversible.
   Preserve and *verify* the data locally first, then destroy.
2. **Empty versioned buckets before `terraform destroy`.** A versioned bucket
   with `force_destroy = false` that still holds versions or delete-markers
   makes the destroy fail. `aws s3 rm --recursive` is not enough — see B1.
3. **State bucket last.** Destroying Terraform's state while resources still
   exist leaves orphaned resources that nothing remembers. The state bucket is
   the *last* thing to go, after everything it describes is verified gone.
4. **Verify against APIs, not assumptions.** `dig` lies when the zone has a
   wildcard record; `describe-instances` lists terminated instances for ~1h.
   Verify with the authoritative API and check state fields, not existence.

## Phase A — Preserve data (nothing destroyed yet)

### A1. Baseline and locate the instance

```bash
aws sts get-caller-identity                 # credentials work
terraform -chdir=<TF_DIR> output -raw instance_id   # read the id from state
curl -sI https://<SITE_DOMAIN> | head -3    # confirm the site is serving
```

### A2. Force the backup replica current

Push any trailing writes to the replica *before* anything else changes. This
run used Litestream over SSM-only access (no SSH):

```bash
aws ssm send-command --region <REGION> --document-name "AWS-RunShellScript" \
  --instance-ids <INSTANCE_ID> \
  --parameters 'commands=["cd <DEPLOY_DIR> && <replica sync command>"]'
# poll aws ssm get-command-invocation until Status leaves Pending|InProgress|Delayed
```

Confirm the replica transaction id equals the live one in the output.

### A3. Restore a consistent snapshot — never copy a live database

Copying a live SQLite file can capture a torn write. Restore from the replica
to a *fresh* path on the instance instead; the restore output is guaranteed
consistent:

```bash
# via SSM: <restore command> -o <fresh-path-on-data-volume> <replica-uri>
```

### A4. Stage the snapshot somewhere pullable

SSM cannot stream files back to your machine. Round-trip through S3: the
instance role can write to its own backup bucket, and you can read it locally:

```bash
# on the instance: upload the restored file to the backup bucket
aws s3 cp <fresh-path> s3://<BACKUP_BUCKET>/final/<DB_FILE>
```

### A5. Download and verify locally

```bash
mkdir -p <BACKUP_DIR>/<YYYY-MM-DD>
aws s3 cp s3://<BACKUP_BUCKET>/final/<DB_FILE> <BACKUP_DIR>/<YYYY-MM-DD>/<DB_FILE>
aws s3 cp s3://<BACKUP_BUCKET>/config/<CONFIG_TARBALL> <BACKUP_DIR>/<YYYY-MM-DD>/
```

Verify with the *application's own* DB driver (no extra tooling): open the
file read-only, run `PRAGMA integrity_check`, and count rows per table. Do not
proceed until the backup verifies. Ignore the backup directory in git — it
holds production data, possibly PII.

## Phase B — Destroy application resources

### B1. Empty versioned buckets first (the classic trap)

`terraform destroy` on a non-empty bucket with `force_destroy = false` fails.
`aws s3 rm --recursive` only removes current versions — old versions and
delete-markers keep the bucket non-empty. Purge *versions and markers
together*, in batches of ≤1000, looping while truncated:

```bash
while :; do
  aws s3api list-object-versions --bucket <BACKUP_BUCKET> --max-items 1000 --output json \
    | jq -c '{Objects: [.Versions[]?, .DeleteMarkers[]? | {Key, VersionId}], Quiet: true}' \
    > /tmp/delete.json
  jq -e '.Objects | length > 0' /tmp/delete.json >/dev/null || break
  aws s3api delete-objects --bucket <BACKUP_BUCKET> --delete file:///tmp/delete.json
done
# confirm zero:
aws s3api list-object-versions --bucket <BACKUP_BUCKET> --max-items 1000 --output json \
  | jq '{versions: (.Versions | length), delete_markers: (.DeleteMarkers | length)}'
```

### B2. Empty the container registry (second trap)

If the IaC doesn't set `force_delete`, destroying a registry holding images
fails with `RepositoryNotEmptyException`. Delete images first and let
Terraform remove the (now empty) repository:

```bash
aws ecr list-images --repository-name <ECR_REPO> --query 'imageIds' --output json > /tmp/images.json
aws ecr batch-delete-image --repository-name <ECR_REPO> --image-ids file:///tmp/images.json
```

### B3. Destroy

```bash
terraform -chdir=<TF_DIR> destroy -auto-approve
```

This is the point of no return: the site goes down here. Expect a few minutes
(instance termination and volume deletion dominate).

### B4. Verify against the APIs

```bash
terraform -chdir=<TF_DIR> state list | grep -v '^data\.'   # no managed resources
```

Check each family with `describe-*` / `list-*` calls: instances, volumes,
addresses, security groups, IAM roles, ECR repos, S3 buckets, DNS records.
Two verification traps learned from the actual run:

- **Terminated instances stay visible in `describe-instances` for ~1 hour.**
  Check `State.Name == "terminated"`, not absence.
- **A wildcard record in a shared zone (e.g. `*.example.com` CNAME → apex)
  makes `dig <subdomain>` keep resolving** after your record is gone. Query
  the zone API instead: `aws route53 list-resource-record-sets --hosted-zone-id
  <ZONE_ID> | grep <name>`. Leave pre-existing zone records alone — they are
  not part of your infrastructure.

Also sweep for auto-created side resources (e.g. CloudWatch log groups that
SSM sessions create).

## Phase C — Destroy the state bucket last

### C1. Purge the state objects

The state bucket is itself versioned — same trap as B1:

```bash
# same list-object-versions + delete-objects loop as B1, against <STATE_BUCKET>
```

### C2. Destroy the bucket via its own module

The bucket was created by a bootstrap module (often the only module with local
state, since the root module's backend lives *inside* this bucket):

```bash
terraform -chdir=<BOOTSTRAP_DIR> destroy -auto-approve
```

If the bootstrap module's state was also remote, empty the bucket and delete
it by hand (`aws s3 rb --force`), then remove the local state file.

### C3. Know the end state

- The root module's backend is gone: any `terraform` command against
  `<TF_DIR>` now fails. That is the expected terminal state, not a bug.
- Keep the IaC sources in the repo as documentation of what was built — they
  cost nothing and make a future rebuild cheap.
- The local backup directory is now the *only* copy of the production data.
  Treat it accordingly (it is intentionally gitignored).

## Pitfalls learned from this run

| Trap | Symptom | Fix |
|---|---|---|
| Versioned bucket not truly emptied | `terraform destroy` fails with `BucketNotEmpty` | Purge versions **and** delete-markers, ≤1000/batch (B1) |
| Non-empty ECR repo | `RepositoryNotEmptyException` | `batch-delete-image` first, then destroy (B2) |
| Copying a live SQLite DB | Torn/corrupt backup | Restore from replica to a fresh path (A3) |
| SSM-only access | No way to pull files off the instance | Round-trip through S3 (A4) |
| State bucket destroyed early | Orphaned resources nothing tracks | State bucket strictly last (rule 3) |
| `dig` after record deletion | Still resolves — looks like a leftover | Wildcard in shared zone; query the zone API (B4) |
| `describe-instances` after destroy | Instance "still there" | Terminated instances linger ~1h; check state (B4) |
| Root module commands fail afterwards | `Backend initialization required` / bucket missing | Expected once the state bucket is gone (C3) |

## Placeholder → this-run values

The concrete values used in the run this document was written from:

| Placeholder | pd-tinder value (2026-08-27) |
|---|---|
| `<REGION>` | `ap-southeast-1` |
| `<TF_DIR>` | `terraform/` (root module) |
| `<BOOTSTRAP_DIR>` | `terraform/bootstrap/` |
| `<INSTANCE_ID>` | read via `terraform output`, changed across rebuilds |
| `<SITE_DOMAIN>` | `pdtinder.kattokloset.com` |
| `<DEPLOY_DIR>` | `/srv/pdtinder/deploy` |
| `<replica sync command>` | `docker compose exec -T litestream litestream sync -wait /data/pd-tinder.db` |
| `<restore command>` | `docker compose run -T --rm --no-deps litestream restore` |
| `<fresh-path-on-data-volume>` | `/data/pd-tinder-final.db` (container path; host `/srv/pdtinder/data/`) |
| `<replica-uri>` | `s3://pdtinder-backup/pd-tinder` |
| `<BACKUP_BUCKET>` | `pdtinder-backup` |
| `<STATE_BUCKET>` | `pdtinder-state` |
| `<ECR_REPO>` | `pd-tinder` |
| `<CONFIG_TARBALL>` | `deploy.tar.gz` at `s3://<BACKUP_BUCKET>/config/` |
| `<DB_FILE>` | `pd-tinder.db` |
| `<BACKUP_DIR>` | `backups/` (repo root, gitignored) |
| `<ZONE_ID>` | external hosted zone, never managed by this deployment |

Backup verification for that run: `PRAGMA integrity_check` → `ok`; per-table
row counts matched the live database.
