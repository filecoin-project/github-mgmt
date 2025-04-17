import 'reflect-metadata'
import {Config} from '../yaml/config.js'
import {Repository} from '../resources/repository.js'
import {GitHub} from '../github.js'
import {Resource, ResourceConstructor} from '../resources/resource.js'
import env from '../env.js'

const AUDIT_LOG_LENGTH_IN_MONTHS = 12

function getResources<T extends Resource>(
  config: Config,
  resourceClass: ResourceConstructor<T>
): T[] {
  const schema = config.get()
  return config.getResources(resourceClass).filter(resource => {
    const node = config.document.getIn(
      resource.getSchemaPath(schema),
      true
    ) as {comment?: string}
    return !node.comment?.includes('KEEP:')
  })
}

/* This function is used to archive inactive repositories.
 *
 * A repository is considered inactive if it:
 *  a. does not have 'KEEP:' in its inline comment AND
 *  b. has no events (pull requests or issues) in the past 12 months AND
 *  c. has no activity (commits) in the past 12 months.
 */

async function run(): Promise<void> {
  const logStartDate = new Date()
  logStartDate.setMonth(logStartDate.getMonth() - AUDIT_LOG_LENGTH_IN_MONTHS)

  const github = await GitHub.getGitHub()
  const repositoriesFromGitHub = (await github.listRepositories()).filter(repository => {
    return !repository.archived
  })

  const repositoryEvents = []
  for (const repository of repositoriesFromGitHub) {
    const {data: events} = await github.client.issues.listEventsForRepo({
      owner: env.GITHUB_ORG,
      repo: repository.name,
      per_page: 1
    })
    const event = events?.at(0)
    repositoryEvents.push({repository, event})
  }

  const repositoryActivities = []
  for (const repository of repositoriesFromGitHub) {
    const {data: activities} = await github.client.repos.listActivities({
      owner: env.GITHUB_ORG,
      repo: repository.name,
      per_page: 1
    })
    const activity = activities?.at(0)
    repositoryActivities.push({repository, activity})
  }

  const config = Config.FromPath()
  const repositories = getResources(config, Repository)
  for (const repository of repositories) {
    const event = repositoryEvents.find(repositoryEvent => {
      return repositoryEvent.repository.name === repository.name
    })?.event
    const activity = repositoryActivities.find(repositoryActivity => {
      return repositoryActivity.repository.name === repository.name
    })?.activity

    const recentEvent = event?.created_at && new Date(event?.created_at) >= logStartDate
    const recentActivity = activity?.timestamp && new Date(activity?.timestamp) >= logStartDate

    if (recentEvent || recentActivity) {
      continue
    }

    repository.archived = true

    config.addResource(repository)
  }

  config.save()
}

run()
