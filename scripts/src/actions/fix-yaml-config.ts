import 'reflect-metadata'
import {Repository} from '../resources/repository.js'
import {Permission} from '../resources/repository-collaborator.js'
import {runFormat} from './shared/format.js'
import {runAddCollaboratorToAllRepos} from './shared/add-collaborator-to-all-repos.js'
import {runSetPropertyInAllRepos} from './shared/set-property-in-all-repos.js'
import {runToggleArchivedRepos} from './shared/toggle-archived-repos.js'
import {runDescribeAccessChanges} from './shared/describe-access-changes.js'

import * as core from '@actions/core'
import {GitHub} from '../github.js'

function isPublic(repository: Repository) {
  return repository.visibility === 'public'
}

async function run() {
  const github = await GitHub.getGitHub()
  const repositories = await github.listRepositories()
  const isRust = (repository: Repository) => {
    return (
      repositories.find(r => r.name === repository.name)?.language === 'Rust'
    )
  }

  await runSetPropertyInAllRepos('secret_scanning', true, r => isPublic(r))
  await runSetPropertyInAllRepos('secret_scanning_push_protection', true, r =>
    isPublic(r)
  )
  // Ensure all Rust repos have a consistent superuser per https://github.com/filecoin-project/github-mgmt/issues/104
  await runAddCollaboratorToAllRepos('filecoin-helper', Permission.Push, r =>
    isRust(r)
  )
  await runToggleArchivedRepos()
  const accessChangesDescription = await runDescribeAccessChanges()
  core.setOutput(
    'comment',
    `The following access changes will be introduced as a result of applying the plan:

<details><summary>Access Changes</summary>

\`\`\`
${accessChangesDescription}
\`\`\`

</details>`
  )
  await runFormat()
}

run()
