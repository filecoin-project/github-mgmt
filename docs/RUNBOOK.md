# Filecoin Project github-mgmt runbook

## How it works

Edit [`github/filecoin-project.yml`](../github/filecoin-project.yml) to change managed GitHub settings through a PR. `Plan` previews the change. `Apply` runs after merge and checks that its plan matches the reviewed plan before writing to GitHub. `Sync` reads GitHub into Terraform state and updates the YAML.

| Terraform backend | Value |
| --- | --- |
| FilOz AWS account and region | `941641221830`, `us-east-1` |
| Bucket and workspace | `filoz-github-mgmt-filecoin-project`, `filecoin-project` |
| State object | `org/filecoin-project/terraform.tfstate` |
| S3 lock object | `org/filecoin-project/terraform.tfstate.tflock` |
| GitHub OIDC roles | `filoz-github-mgmt-filecoin-project-ro` and `filoz-github-mgmt-filecoin-project-rw` |

The bucket is versioned. Keep the separate bootstrap state in an access-controlled location so maintainers can update the bucket and IAM roles. [Backend configuration](../terraform/terraform_override.tf) · [Bootstrap configuration](../terraform/bootstrap/aws.tf)

### Workflow credentials

The GitHub Apps authenticate GitHub API calls. `Plan`, the read step of `Fix`, `Apply` preparation, and `Clean Up` use the read-only App. The jobs that apply changes or push configuration use the read-write App.

GitHub OIDC provides temporary S3 credentials. `Plan`, its `Comment` job, and `Fix` use the read-only AWS role through the `read` environment. `Apply`, `Sync`, and `Clean` use the read-write AWS role through `write`. The `write` and `push` environments are restricted to `master`. [GitHub OIDC documentation](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)

## Change access through a PR

1. Edit the relevant member, team, or repository collaborator in `github/filecoin-project.yml`. Open a PR to `master` and check any `Fix` commits.
2. Review the complete Terraform plan. The access summary covers permissions. For a long plan, open **Plan → Comment → Show terraform plans** to see every resource change.
3. Merge after approval. Verify that **Terraform Apply** succeeded for the merge commit and confirm the resulting permissions in GitHub.
4. Wait for `Apply` and `Update` to finish before merging another PR. `Update` attempts to refresh eligible open PR branches so they get a new plan. Update skipped or conflicting branches manually and review the new plan. [Update workflow](../.github/workflows/update.yml)

PR #250 added four direct repository write grants. The plan contained four additions, Apply succeeded, and all four repositories showed `WRITE` for the intended account. [Example plan](https://github.com/filecoin-project/github-mgmt/pull/250#issuecomment-7202479120) · [Apply run](https://github.com/filecoin-project/github-mgmt/actions/runs/45890081205)

## Sync from GitHub

For a manual sync, open **Actions → Sync → Run workflow** and select `master`. Use workspace `filecoin-project` or leave the field blank. Keep `lock=true` and use the default `refresh=false`. This skips the optional refresh before importing. Sync still refreshes state after importing. Wait for in-flight writes to finish before starting, then hold merges until **Sync (filecoin-project)** and **Push** succeed. Review the YAML diff. The [`.sync` file](../.sync) records the run ID. Weekly Sync with an existing state typically took around 20 minutes before cutover. [Sync workflow](../.github/workflows/sync.yml) · [Example scheduled run](https://github.com/filecoin-project/github-mgmt/actions/runs/44966353928)

### Rebuild an empty backend

1. Pause merges, disable `Apply`, and let in-flight Apply runs finish before merging the backend change.
2. Run `Sync` from `master` against the new backend. Keep `Apply` disabled until both **Sync (filecoin-project)** and **Push** succeed and the new YAML is on `master`.
3. Re-enable `Apply`. Verify the new backend with a small PR and review its fresh Plan before merging. Check that Apply succeeds and that GitHub reflects the intended change.

The November 26, 2026 cutover took **about 6 hours 12 minutes** from the first run starting at 13:47 UTC until the successful Push completed at 19:59 UTC. The first run's four-hour AWS OIDC session expired during an S3 write. After clearing the stale lock, the successful run resumed from the state already saved in S3 and took about 2 hours 7 minutes, including Push. Use six hours as a planning reference for a full rebuild and allow time for recovery. [First attempt](https://github.com/filecoin-project/github-mgmt/actions/runs/45832572345) · [Successful continuation](https://github.com/filecoin-project/github-mgmt/actions/runs/45871332934)

If credentials expire during a rebuild, check the latest state object version. Wait for other state writers to finish and [confirm the lock is stale before clearing it](#recover-from-a-stuck-state-lock). Rerun Sync against the same backend and workspace with `lock=true`. S3 version timestamps show when state was last saved. Check the Actions run for completion.

The first post-cutover Plan listed merge and sign-off defaults on 236 archived repositories alongside the intended collaborator change. The GitHub provider skips those repository updates while the repositories stay archived. Check the complete plan for that exact pattern and review any other changes separately. [First Plan](https://github.com/filecoin-project/github-mgmt/actions/runs/45888028700/job/140143958543) · [Provider update logic](https://github.com/integrations/terraform-provider-github/blob/v6.6.0/github/resource_github_repository.go#L740-L746)

## Recover from a failed Apply

Pause other merges and open the failed run for the merge commit.

- **AWS sign-in failed.** Check the role ARN, OIDC trust, job environment, and session duration. For GitHub sign-in, check the App ID, installation ID, and active PEM secret.
- **Reviewed plan missing.** Check **Find sha for plan** and **Download reviewed terraform plan**. Retry only after fixing the cause and confirming the reviewed plan is still current.
- **Plan comparison failed or Apply may have made partial changes.** Check the affected GitHub settings and Terraform state. Review a fresh plan in a follow-up PR. Run Sync when the current GitHub settings should be reflected in the YAML.
- Resume merges after Apply succeeds, the result is verified in GitHub, and Update completes. [Apply workflow](../.github/workflows/apply.yml)

## Recover from a stuck state lock

Record the lock ID and path from the error. Check for active or queued `Apply`, `Sync`, and `Clean` runs and confirm with the operator that the lock holder has stopped. Use a fresh checkout of `master` and an MFA-backed session with access to the backend. Check the account first with `aws sts get-caller-identity --query Account --output text`. Continue only for account `941641221830`.

```sh
terraform -chdir=terraform init -input=false
terraform -chdir=terraform workspace select filecoin-project
terraform -chdir=terraform workspace show
```

Confirm workspace `filecoin-project` and that the error points to the bucket and lock object listed above. Run `terraform -chdir=terraform force-unlock LOCK_ID` with the ID from the failed run. Keep locking enabled for the retry. [Terraform state locking](https://developer.hashicorp.com/terraform/language/state/locking#force-unlock)

## Rotate credentials

1. Check **Settings → Secrets and variables → Actions** and **Settings → Environments** for the active GitHub App secrets. If moving the secrets to environments, place `RO_GITHUB_APP_*` in `read` and `push`, and `RW_GITHUB_APP_*` in `write` and `push`. Before removing the repository-level read-write secrets, verify [Upgrade](../.github/workflows/upgrade.yml) can still resolve them. Its caller maps `RW_GITHUB_APP_*` to `GITHUB_APP_*` in the reusable workflow, whose job runs in the `push` environment.
2. Have an App manager generate a new PEM and update the active `RO_GITHUB_APP_PEM_FILE` or `RW_GITHUB_APP_PEM_FILE`. Verify the workflows that use the rotated App, then revoke the old key. [GitHub App key rotation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps)

Manage AWS OIDC trust and role changes in the bootstrap Terraform. Retire any remaining legacy `RO_AWS_*` and `RW_AWS_*` repository secrets after cutover verification.

## Upgrade from upstream

Run [Upgrade](../.github/workflows/upgrade.yml) from `master` with a reviewed upstream commit SHA in `ref`. The input selects the template revision. The caller loads the reusable workflow itself from `ipdxco/github-as-code@master` and passes the read-write App secrets. Review the generated PR for plan and workflow changes, especially the AWS backend, OIDC, environment rules, and bootstrap configuration. If preparing the update manually, record the upstream SHA in the PR and preserve these repository-specific settings.
