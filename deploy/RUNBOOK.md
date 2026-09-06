# pd-tinder — deployment runbook

> **This infrastructure was torn down on 2026-08-27.** The steps taken, and a
> generic reusable version of them, are in
> [docs/teardown-runbook.md](../docs/teardown-runbook.md). This document is
> **frozen as a historical record** of how the deployment worked; it is not
> maintained. If the infrastructure is rebuilt from the retained `terraform/`
> sources (the state bucket is gone; the bootstrap step below would run again
> from scratch), start a fresh runbook for the new deployment rather than
> editing this one in place.
>
> **Maintenance:** none — frozen. See `README.md` → "Docs maintenance".

One command per stage. Run from the repository root with AWS credentials.
Region is `ap-southeast-1` throughout; instance access is SSM only (no SSH).

## Prerequisites

```bash
aws sts get-caller-identity   # credentials work
terraform -version            # >= 1.10
```

## 1. Bootstrap the Terraform state bucket (once, ever)

```bash
cd terraform/bootstrap
terraform init
terraform apply -auto-approve
cd ../..
```

## 2. Create the infrastructure

```bash
cd terraform
terraform init               # backend = pdtinder-state (S3, native lockfile)
terraform plan
terraform apply -auto-approve
terraform output             # record instance_id, ecr_repository_url
cd ..
```

## 3. First deploy

```bash
scripts/deploy.sh            # gate → build → push → configs → SSM restart
```

Watch the SSM run:

```bash
aws ssm get-command-invocation --region ap-southeast-1 \
  --command-id <id-from-deploy.sh> --instance-id <instance-id> \
  --query 'StandardOutputContent'
```

## 4. First-administrator bootstrap (once)

```bash
aws ssm send-command --region ap-southeast-1 \
  --document-name "AWS-RunShellScript" \
  --instance-ids <instance-id> \
  --parameters 'commands=["cd /srv/pdtinder/deploy && docker compose exec -T app npx tsx scripts/bootstrap-admin.ts --name \"<operator-name>\" --email <operator-email>"]'
```

Read the printed invite link from the command output, open it in a browser,
and choose the admin password. Then create the cycle:

```bash
aws ssm send-command --region ap-southeast-1 \
  --document-name "AWS-RunShellScript" \
  --instance-ids <instance-id> \
  --parameters 'commands=["cd /srv/pdtinder/deploy && docker compose exec -T app npx tsx scripts/create-cycle.ts --name \"Mentee Recruitment 2026\" --year 2026"]'
```

## 5. Live smoke test

```bash
SMOKE_BASE_URL=https://pdtinder.kattokloset.com \
  SMOKE_ADMIN_EMAIL=<operator-email> \
  SMOKE_ADMIN_PASSWORD=<the-password-you-chose> \
  npm run smoke
```

All green means: TLS serves, form POSTs pass the origin check, the real CSV
imported (body limit + migrations), a reviewer was invited and submitted a
verdict.

## 6. Rollback

The previous image is still in ECR. Re-run the restart against its tag:

```bash
IMAGE_TAG=<previous-git-sha> scripts/deploy.sh --config-only   # ships configs only
aws ssm send-command --region ap-southeast-1 \
  --document-name "AWS-RunShellScript" \
  --instance-ids <instance-id> \
  --parameters "commands=[\"cd /srv/pdtinder/deploy && aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin <ecr-uri> && APP_IMAGE=<ecr-uri>:<previous-git-sha> docker compose up -d --pull always\"]"
```

## 7. Restore drill (rehearse once before the cycle opens)

```bash
# 0. Force an immediate sync so the replica is current. (litestream 0.5 has no
#    snapshot subcommand; `sync -wait` is its replacement.)
aws ssm send-command --region ap-southeast-1 --document-name "AWS-RunShellScript" \
  --instance-ids <instance-id> \
  --parameters 'commands=["cd /srv/pdtinder/deploy && docker compose exec -T litestream litestream sync -wait /data/pd-tinder.db"]'

# 1. Destroy the instance and its data volume ONLY (everything else survives).
cd terraform
terraform destroy -target=aws_instance.pdtinder -target=aws_ebs_volume.data \
  -target=aws_volume_attachment.data -auto-approve

# 2. Rebuild. The instance id changes — the commands below re-read it from
#    the terraform output each time.
terraform apply -auto-approve
cd ..

# 3. Ship configs to the fresh instance, then restore the database BEFORE the
#    app ever starts (a fresh empty database must never replicate over the
#    replica — restore first, always). --config-only uploads the tarball to S3
#    but sends no SSM command, so this command downloads and extracts it first
#    (the fresh instance's /srv/pdtinder/deploy is empty). The image entrypoint
#    is already `litestream`, so `restore` is invoked without the binary name.
scripts/deploy.sh --config-only
aws ssm send-command --region ap-southeast-1 --document-name "AWS-RunShellScript" \
  --instance-ids $(terraform -chdir=terraform output -raw instance_id) \
  --parameters 'commands=["aws s3 cp s3://pdtinder-backup/config/deploy.tar.gz /srv/pdtinder/deploy.tar.gz && tar -xzf /srv/pdtinder/deploy.tar.gz -C /srv/pdtinder/deploy && cd /srv/pdtinder/deploy && docker compose run --rm --no-deps litestream restore -o /data/pd-tinder.db s3://pdtinder-backup/pd-tinder && aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin <ecr-uri> && APP_IMAGE=<ecr-uri>:latest docker compose up -d"]'

# 4. Prove it: the restored instance passes the smoke test. Import is skipped —
#    the restored database must already contain the imported applicants.
SMOKE_BASE_URL=https://pdtinder.kattokloset.com \
  SMOKE_ADMIN_EMAIL=<operator-email> \
  SMOKE_ADMIN_PASSWORD=<the-password-you-chose> \
  SMOKE_SKIP_IMPORT=1 npm run smoke
```

## 8. Dormancy (between cycles)

Stopping the instance still bills the public IPv4 (~$5.67/month). To drop to
~$2.02/month, release the Elastic IP (`terraform destroy -target=aws_eip.pdtinder`)
and re-apply when the cycle reopens; DNS follows automatically.
