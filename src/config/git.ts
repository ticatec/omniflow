/**
 * Omniflow Git Configuration
 * Handles git configuration queries for projects
 */

import type { GitProjectConfig, EnvironmentConfig, OmniflowConfig } from '../types/config.js'

/**
 * Get merged Git configuration for a project
 * @param config Omniflow configuration
 * @param projectPath Project path like "omni-gate/platform"
 * @param envName Environment name like "test" or "prod"
 */
export function getGitConfig(
  config: OmniflowConfig,
  projectPath: string,
  envName?: string
): {
  url: string
  branch: string
  username?: string
  password?: string
  merge_from?: string
  strategy?: string
} | null {
  // Find project by path
  const pathParts = projectPath.split('/')
  const project = findProjectByPath(config.projects, pathParts)

  if (!project) return null

  const globalGit = config.omniflow.git
  const projectRepos = project.repos as GitProjectConfig | undefined

  // Build URL
  let url = ''
  if (projectRepos?.git) {
    url = projectRepos.git
  } else if (globalGit?.repos) {
    const projectName = projectPath.replace(/-/g, '/')
    url = `${globalGit.repos}/${projectName}.git`
  } else {
    return null
  }

  // Determine branch
  let targetBranch = 'main'
  let mergeFrom: string | undefined

  if (envName && project.environments) {
    // Find environment config by name
    const envConfig = project.environments.find((e: EnvironmentConfig) => e.name === envName)
    if (envConfig) {
      targetBranch = envConfig.branch
      mergeFrom = envConfig.merge_from
    }
  } else if (projectRepos?.branch) {
    targetBranch = projectRepos.branch
  } else if (globalGit?.default_branch) {
    targetBranch = globalGit.default_branch
  }

  // Strategy comes from: project repos -> omniflow.env -> process.env
  const strategy = projectRepos?.merge_strategy ||
                   config.omniflow.env?.GIT_MERGE_STRATEGY ||
                   process.env.GIT_MERGE_STRATEGY

  // Merge configuration (project takes precedence)
  return {
    url,
    branch: targetBranch,
    username: projectRepos?.username || globalGit?.username,
    password: projectRepos?.password || globalGit?.password,
    merge_from: mergeFrom,
    strategy: strategy
  }
}

/**
 * Find a project by its path (supports nested paths like "omni-gate/platform")
 */
function findProjectByPath(projects: any[], pathParts: string[]): any {
  const [current, ...rest] = pathParts

  for (const item of projects) {
    if (item.name === current) {
      if (rest.length === 0) {
        return item.type === 'folder' ? null : item
      } else {
        if (item.type === 'folder' && item.items) {
          return findProjectByPath(item.items, rest)
        }
        return null
      }
    }
  }

  return null
}