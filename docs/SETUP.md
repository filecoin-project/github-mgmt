# Setup

*NOTE*: The following TODO list is complete - it contains all the steps you should complete to get GitHub Management up. You might be able to skip some of them if you completed them before.

- [ ] [Create a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template) from the template - *this is the place for GitHub Management to live in*

## GitHub Organization

- [ ] [Set base permissions for the organization](https://docs.github.com/en/organizations/managing-access-to-your-organizations-repositories/setting-base-permissions-for-an-organization) to `Read` or `None` not to make all organization members de-facto admins through GitHub Management - `gh api -X PATCH /orgs/$GITHUB_ORGANIZATION -f default_repository_permission=read`
- [ ] If you plan to keep the GitHub Management repository private, [allow forking of private repositories](https://docs.github.com/en/organizations/managing-organization-settings/managing-the-forking-policy-for-your-organization) and [enable workflows for private repository forks](https://docs.github.com/en/organizations/managing-organization-settings/disabling-or-limiting-github-actions-for-your-organization#enabling-workflows-for-private-repository-forks) - `gh api -X PATCH /orgs/$GITHUB_ORGANIZATION -f members_can_fork_private_repositories=true` (enabling workflows for private repository forks is not possible through API)

## AWS

filecoin-project uses a versioned S3 bucket for Terraform state and [S3 lock files](https://developer.hashicorp.com/terraform/language/backend/s3#enabling-s3-state-locking). GitHub Actions uses [OIDC](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws) to assume one of two IAM roles.

- [ ] Use the [bootstrap Terraform configuration](../terraform/bootstrap/aws.tf) to manage the bucket and roles in the FilOz AWS account. The account already has the GitHub Actions OIDC provider.
- [ ] Keep the bootstrap Terraform state in secure storage and use that state for subsequent changes to the bucket and roles.
- [ ] If you change the backend, keep [terraform/terraform_override.tf](../terraform/terraform_override.tf), the IAM policies, and the workflow role ARNs in sync.
- [ ] Restrict the GitHub Actions `write` and `push` environments to `master`. The read-only role trusts the `read` environment, and the read-write role trusts the `write` environment. Sync requests a four-hour read-write session so the initial organization import can run beyond the default hour.

## GitHub App

*NOTE*: If you already have a GitHub App with required permissions you can skip the app creation step.

- [ ] [Create 2 GitHub Apps](https://docs.github.com/en/developers/apps/building-github-apps/creating-a-github-app) in the GitHub organization with the following permissions - *they are going to be used by terraform and GitHub Actions to authenticate with GitHub*:
    <details><summary>read-only</summary>

    - `Repository permissions`
        - `Administration`: `Read-only`
        - `Contents`: `Read-only`
        - `Metadata`: `Read-only`
    - `Organization permissions`
        - `Members`: `Read-only`
    </details>
    <details><summary>read & write</summary>

    - `Repository permissions`
        - `Administration`: `Read & Write`
        - `Contents`: `Read & Write`
        - `Metadata`: `Read-only`
        - `Pull requests`: `Read & Write`
        - `Workflows`: `Read & Write`
    - `Organization permissions`
        - `Members`: `Read & Write`
    </details>
- [ ] [Install the GitHub Apps](https://docs.github.com/en/developers/apps/managing-github-apps/installing-github-apps) in the GitHub organization for `All repositories`

## GitHub Actions Environments and Secrets

- [ ] Create GitHub Actions environments named `read`, `write`, and `push`, and configure protection rules such as required reviewers. Workflows that read organization state reference `read`; workflows that write organization state reference `write`; workflows that push generated changes to the GitHub Management repository reference `push`.
- [ ] [Create encrypted secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-an-organization) for the GitHub organization and allow the repository to access them (\*replace `$GITHUB_ORGANIZATION_NAME` with the GitHub organization name) - *these secrets are read by the GitHub Action workflows*
    - [ ] Go to `https://github.com/organizations/$GITHUB_ORGANIZATION_NAME/settings/apps/$GITHUB_APP_NAME` and copy the `App ID`
       - [ ] `RO_GITHUB_APP_ID`
       - [ ] `RW_GITHUB_APP_ID`
    - [ ] Go to `https://github.com/organizations/$GITHUB_ORGANIZATION_NAME/settings/installations`, click `Configure` next to the `$GITHUB_APP_NAME` and copy the numeric suffix from the URL
       - [ ] `RO_GITHUB_APP_INSTALLATION_ID` (or `RO_GITHUB_APP_INSTALLATION_ID_$GITHUB_ORGANIZATION_NAME` for organizations other than the repository owner)
       - [ ] `RW_GITHUB_APP_INSTALLATION_ID` (or `RW_GITHUB_APP_INSTALLATION_ID_$GITHUB_ORGANIZATION_NAME` for organizations other than the repository owner)
    - [ ] Go to `https://github.com/organizations/$GITHUB_ORGANIZATION_NAME/settings/apps/$GITHUB_APP_NAME`, click `Generate a private key` and copy the contents of the downloaded PEM file
       - [ ] `RO_GITHUB_APP_PEM_FILE`
       - [ ] `RW_GITHUB_APP_PEM_FILE`

## GitHub Management Repository Setup

*NOTE*: Advanced users might want to modify the resource types and their arguments/attributes managed by GitHub Management at this stage.

*NOTE*: You can manage more than one organization from a single GitHub Management repository. To do so create more YAMLs under `github` directory. Remember to set up secrets for all your organizations.

- [ ] [Clone the repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository)
- [ ] Replace placeholder strings in the clone - *the repository needs to be customised for the specific organization it is supposed to manage*
    - [ ] Rename the `$GITHUB_ORGANIZATION_NAME.yml` in `github` to the name of the GitHub organization
- [ ] Push the changes to `$GITHUB_MGMT_REPOSITORY_DEFAULT_BRANCH`

> [!WARNING] Please note that until you [synchronize GitHub Management with GitHub](#github-management-sync-flow) for the first time, the workflows that depend on Terraform state, like `Fix`, `Plan` or `Apply`, will fail. This is because the state is not yet initialized.

## GitHub Management Sync Flow

- [ ] Follow [How to synchronize GitHub Management with GitHub?](HOWTOS.md#synchronize-github-management-with-github) to commit the terraform lock and initialize terraform state

## GitHub Management Repository Protections

*NOTE*: Advanced users might have to skip/adjust this step if they are not managing some of the arguments/attributes mentioned here with GitHub Management.

*NOTE*: If you want to require PRs to be created but don't care about reviews, then change `required_approving_review_count` value to `0`. It seems for some reason the provider's default is `1` instead of `0`. The next `Sync` will remove this value from the configuration file and will leave an empty object inside `required_pull_request_reviews` which is the desired state.

*NOTE*: Branch protection rules are not available for private repositories on Free plan.

- [ ] Manually set values that are impossible to control this value via terraform currently
   - [ ] [Set read repository contents permissions for `GITHUB_TOKEN`](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#setting-the-permissions-of-the-github_token-for-your-repository)
   - [ ] If the repository is public, [require approval for all outside collaborators](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#configuring-required-approval-for-workflows-from-public-forks)
   - [ ] If the repository is private, [disable sending write tokens or secrets to workflows from fork pull requests](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#enabling-workflows-for-private-repository-forks)
- [ ] Pull remote changes to the default branch
- [ ] Enable required PRs, peer reviews, status checks and branch up-to-date check on the repository by making sure [github/$ORGANIZATION_NAME.yml](github/$ORGANIZATION_NAME.yml) contains the following entry:
    ```yaml
    repositories:
      $GITHUB_MGMT_REPOSITORY_NAME:
        branch_protection:
          $GITHUB_MGMT_REPOSITORY_DEFAULT_BRANCH:
            required_pull_request_reviews:
              dismiss_stale_reviews: true
              require_last_push_approval: true
              required_approving_review_count: 1
            required_status_checks:
              contexts:
                - Comment
              strict: true
    ```
- [ ] Push the changes to a branch other than the default branch

## GitHub Management PR Flow

*NOTE*: Advanced users might have to skip this step if they skipped setting up [GitHub Management Repository Protections](#github-management-repository-protections) via GitHub Management.

- [ ] Follow [How to apply GitHub Management changes to GitHub?](HOWTOS.md#apply-github-management-changes-to-github) to apply protections to the repository
