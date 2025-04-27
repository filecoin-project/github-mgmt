import 'reflect-metadata'
import {Repository} from '../resources/repository.js'
import {RepositoryCollaborator} from '../resources/repository-collaborator.js'
import {runFormat} from './shared/format.js'
import {runSetPropertyInAllRepos} from './shared/set-property-in-all-repos.js'
import {runToggleArchivedRepos} from './shared/toggle-archived-repos.js'
import {runDescribeAccessChanges} from './shared/describe-access-changes.js'

import * as core from '@actions/core'
import {Config} from '../yaml/config.js'
import {TeamMember} from '../resources/team-member.js'

function isPublic(repository: Repository) {
  return repository.visibility === 'public'
}

async function removeFilecoinHelperFromAllTeamsAndRepos() {
  const config = Config.FromPath()

  const collaborators = config
    .getResources(RepositoryCollaborator)
    .filter(c => c.username === 'filecoin-helper')

  for (const collaborator of collaborators) {
    config.removeResource(collaborator)
  }

  const teamMembers = config
    .getResources(TeamMember)
    .filter(tm => tm.username === 'filecoin-helper')

  for (const teamMember of teamMembers) {
    config.removeResource(teamMember)
  }

  config.save()
}

async function run() {
  await runSetPropertyInAllRepos('secret_scanning', true, r => isPublic(r))
  await runSetPropertyInAllRepos('secret_scanning_push_protection', true, r =>
    isPublic(r)
  )
  // Ensure filecoin-helper is not a collaborator or a team member anywhere, as per https://github.com/filecoin-project/github-mgmt/issues/104
  await removeFilecoinHelperFromAllTeamsAndRepos()
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
