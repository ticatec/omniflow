/**
 * Omniflow Project Management
 * Handles project queries, environment lookups, and project listings
 */

import type {
  ProjectItem,
  ProjectDefinition,
  EnvironmentConfig,
  ProjectNode,
  OmniflowConfig
} from '../types/config.js'

/**
 * Project manager for querying project configurations
 */
export class ProjectManager {
  private config: OmniflowConfig

  constructor(config: OmniflowConfig) {
    this.config = config
  }

  /**
   * Update the cached configuration
   */
  updateConfig(config: OmniflowConfig): void {
    this.config = config
  }

  /**
   * Find a project by its path (supports nested paths like "omni-gate/platform")
   */
  findProjectByPath(projects: ProjectItem[], pathParts: string[]): ProjectItem | null {
    const [current, ...rest] = pathParts

    for (const item of projects) {
      if (item.name === current) {
        if (rest.length === 0) {
          // Found target, check if it's a folder
          return item.type === 'folder' ? null : item
        } else {
          // Continue searching in child items (only folder has items)
          if (item.type === 'folder' && item.items) {
            return this.findProjectByPath(item.items, rest)
          }
          return null
        }
      }
    }

    return null
  }

  /**
   * Get a specific project configuration by path
   * @param projectPath Project path like "omni-gate/platform" or "platform"
   */
  getProject(projectPath: string): ProjectDefinition | null {
    const pathParts = projectPath.split('/')
    const project = this.findProjectByPath(this.config.projects, pathParts)
    return project as ProjectDefinition | null
  }

  /**
   * Get all projects (flattened, excluding folders)
   */
  listProjects(): Array<{ key: string; name: string; description?: string }> {
    const projects: Array<{ key: string; name: string; description?: string }> = []

    const traverse = (items: ProjectItem[], prefix: string = '') => {
      for (const project of items) {
        const path = prefix ? `${prefix}/${project.name}` : project.name

        if (project.type === 'folder') {
          if (project.items) {
            traverse(project.items, path)
          }
        } else {
          projects.push({
            key: path,
            name: project.name,
            description: project.description
          })
        }
      }
    }

    traverse(this.config.projects)
    return projects
  }

  /**
   * List all items (including folders) with their structure
   */
  listProjectTree(): ProjectNode[] {
    const buildTree = (items: ProjectItem[], prefix: string = ''): ProjectNode[] => {
      return items.map(item => {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name
        const isFolder = item.type === 'folder'

        return {
          name: item.name,
          description: item.description,
          type: isFolder ? 'folder' : 'project',
          path: itemPath.split('/'),
          children: isFolder && item.items ? buildTree(item.items, itemPath) : undefined,
          config: isFolder ? undefined : item
        }
      })
    }

    return buildTree(this.config.projects)
  }

  /**
   * Get environment configuration for a project
   * @param projectPath Project path like "omni-gate/platform"
   * @param envName Environment name like "test" or "prod"
   */
  getEnvironment(projectPath: string, envName: string): EnvironmentConfig | null {
    const project = this.getProject(projectPath)
    if (!project || !project.environments) return null

    // Find environment by name
    const envConfig = project.environments.find(e => e.name === envName)
    return envConfig || null
  }

  /**
   * Alias for getEnvironment (backward compatibility)
   */
  getBranch(projectPath: string, branchName: string): EnvironmentConfig | null {
    return this.getEnvironment(projectPath, branchName)
  }

  /**
   * List environments for a project
   * @param projectPath Project path like "omni-gate/platform"
   */
  listEnvironments(projectPath: string): string[] {
    const project = this.getProject(projectPath)
    if (!project || !project.environments) return []

    return project.environments.map(e => e.name)
  }

  /**
   * Alias for listEnvironments (backward compatibility)
   */
  listBranches(projectPath: string): string[] {
    return this.listEnvironments(projectPath)
  }
}