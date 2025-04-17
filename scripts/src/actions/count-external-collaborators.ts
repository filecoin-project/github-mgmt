import 'reflect-metadata'
import {Config} from '../yaml/config.js'
import {Member} from '../resources/member.js'
import {RepositoryCollaborator} from '../resources/repository-collaborator.js'
import {Repository, Visibility} from '../resources/repository.js'

async function run(): Promise<void> {
  const config = Config.FromPath()

  const privateRepositoryNames = config.getResources(Repository).filter(repository => {
    return repository.visibility === Visibility.Private && !repository.archived
  }).map(repository => repository.name)
  const memberUsernames = config.getResources(Member).map(member => member.username)
  const repositoryCollaborators = config.getResources(RepositoryCollaborator).filter(collaborator => {
    return privateRepositoryNames.includes(collaborator.repository) && !memberUsernames.includes(collaborator.username)
  })
  console.log(repositoryCollaborators.length)
}

run()
