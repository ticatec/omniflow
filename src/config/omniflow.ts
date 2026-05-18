// Omniflow configuration loader

import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'
import YAML from 'yaml'
import { exec } from 'child_process'
import { promisify } from 'util'
import type {
  OmniflowConfig,
  ProjectDefinition,
  ProjectItem,
  EnvironmentConfig,
  GitProjectConfig,
  ProjectNode
} from '../types/config.js'

const execAsync = promisify(exec)

export class OmniflowConfigLoader {
  private config: OmniflowConfig | null = null

  /**
   * Fetch configuration from git repository
   * Uses environment variables: OMNIFLOW_CONFIG_REPO, OMNIFLOW_CONFIG_BRANCH
   */
  private async fetchFromGit(): Promise<OmniflowConfig> {
    const {
      OMNIFLOW_CONFIG_REPO,
      OMNIFLOW_CONFIG_BRANCH = 'main',
      OMNIFLOW_CONFIG_FILE = 'config.yaml',
      GIT_USERNAME,
      GIT_PASSWORD
    } = process.env

    if (!OMNIFLOW_CONFIG_REPO) {
      throw new Error(
        'OMNIFLOW_CONFIG_REPO environment variable is required.\n' +
        'Set it with: export OMNIFLOW_CONFIG_REPO=https://git.example.com/omniflow/config.git'
      )
    }

    // Config directory - ~/.omniflow/config/
    const OMNIFLOW_HOME = process.env.OMNIFLOW_HOME || path.join(os.homedir(), '.omniflow')
    const configDir = path.join(OMNIFLOW_HOME, 'config')
    const configPath = path.join(configDir, OMNIFLOW_CONFIG_FILE)

    try {
      // Build authenticated URL
      let repoUrl = OMNIFLOW_CONFIG_REPO
      if (GIT_USERNAME && GIT_PASSWORD) {
        try {
          const urlObj = new URL(OMNIFLOW_CONFIG_REPO)
          urlObj.username = GIT_USERNAME
          urlObj.password = GIT_PASSWORD
          repoUrl = urlObj.toString()
        } catch {
          // Invalid URL, use as-is
        }
      }

      // Check if config file exists
      const configExists = await fs.access(configPath).then(() => true).catch(() => false)

      if (configExists) {
        // Read existing config file directly
        const content = await fs.readFile(configPath, 'utf-8')
        const rawConfig = YAML.parse(content)

        // Validate required fields
        if (!rawConfig.omniflow) {
          throw new Error('Missing "omniflow" section in configuration')
        }

        if (!rawConfig.projects) {
          throw new Error('Missing "projects" section in configuration')
        }

        return rawConfig
      } else {
        // Create config directory and clone config repo to get initial config
        await fs.mkdir(configDir, { recursive: true })

        // Clone to a temporary location to extract config.yaml
        const tempDir = path.join(OMNIFLOW_HOME, '.tmp_config')
        await fs.mkdir(tempDir, { recursive: true })

        const cloneCmd = `git clone --depth 1 --branch ${OMNIFLOW_CONFIG_BRANCH} --single-branch ${repoUrl} ${tempDir}`

        await execAsync(cloneCmd, {
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: '0'
          }
        })

        // Copy config.yaml to the target location
        const tempConfigPath = path.join(tempDir, OMNIFLOW_CONFIG_FILE)
        const content = await fs.readFile(tempConfigPath, 'utf-8')

        await fs.writeFile(configPath, content, 'utf-8')

        // Clean up temp directory
        await fs.rm(tempDir, { recursive: true, force: true })

        const rawConfig = YAML.parse(content)

        // Validate required fields
        if (!rawConfig.omniflow) {
          throw new Error('Missing "omniflow" section in configuration')
        }

        if (!rawConfig.projects) {
          throw new Error('Missing "projects" section in configuration')
        }

        return rawConfig
      }
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new Error(`Configuration file not found: ${configPath}`)
      }
      throw new Error(`Failed to load config: ${(error as Error).message}`)
    }
  }

  /**
   * Load configuration
   * Uses cached config if available, otherwise fetches from git
   */
  async load(): Promise<OmniflowConfig> {
    if (this.config) {
      return this.config
    }

    // Fetch from git and cache
    const rawConfig = await this.fetchFromGit()
    this.config = this.resolveEnvVars(rawConfig)
    return this.config
  }

  /**
   * Find a project by its path (supports nested paths like "omni-gate/platform")
   */
  findProjectByPath(projects: ProjectItem[], pathParts: string[]): ProjectItem | null {
    const [current, ...rest] = pathParts

    for (const item of projects) {
      if (item.name === current) {
        if (rest.length === 0) {
          // 找到目标，检查是否是文件夹
          return item.type === 'folder' ? null : item
        } else {
          // 继续在子项中查找（只有 folder 有 items）
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
  async getProject(projectPath: string): Promise<ProjectDefinition | null> {
    const config = await this.load()
    const pathParts = projectPath.split('/')
    const project = this.findProjectByPath(config.projects, pathParts)
    return project as ProjectDefinition | null
  }

  /**
   * Get all projects (flattened, excluding folders)
   */
  async listProjects(): Promise<Array<{ key: string; name: string; description?: string }>> {
    const config = await this.load()
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

    traverse(config.projects)
    return projects
  }

  /**
   * List all items (including folders) with their structure
   */
  async listProjectTree(): Promise<ProjectNode[]> {
    const config = await this.load()

    const buildTree = (items: ProjectItem[], prefix: string = ''): ProjectNode[] => {
      return items.map(item => {
        const path = prefix ? `${prefix}/${item.name}` : item.name
        const isFolder = item.type === 'folder'

        return {
          name: item.name,
          description: item.description,
          type: isFolder ? 'folder' : 'project',
          path: path.split('/'),
          children: isFolder && item.items ? buildTree(item.items, path) : undefined,
          config: isFolder ? undefined : item
        }
      })
    }

    return buildTree(config.projects)
  }

  /**
   * Get environment configuration for a project
   * @param projectPath Project path like "omni-gate/platform"
   * @param envName Environment name like "test" or "prod"
   */
  async getEnvironment(projectPath: string, envName: string): Promise<EnvironmentConfig | null> {
    const project = await this.getProject(projectPath)
    if (!project || !project.environments) return null

    // Find environment by name
    const envConfig = project.environments.find(e => e.name === envName)
    return envConfig || null
  }

  /**
   * Alias for getEnvironment (backward compatibility)
   */
  async getBranch(projectPath: string, branchName: string): Promise<EnvironmentConfig | null> {
    return this.getEnvironment(projectPath, branchName)
  }

  /**
   * List environments for a project
   * @param projectPath Project path like "omni-gate/platform"
   */
  async listEnvironments(projectPath: string): Promise<string[]> {
    const project = await this.getProject(projectPath)
    if (!project || !project.environments) return []

    return project.environments.map(e => e.name)
  }

  /**
   * Alias for listEnvironments (backward compatibility)
   */
  async listBranches(projectPath: string): Promise<string[]> {
    return this.listEnvironments(projectPath)
  }

  /**
   * Get merged Git configuration for a project
   * @param projectPath Project path like "omni-gate/platform"
   * @param envName Environment name like "test" or "prod"
   */
  async getGitConfig(projectPath: string, envName?: string): Promise<{
    url: string
    branch: string
    username?: string
    password?: string
    merge_from?: string
    strategy?: string
    merge_method?: 'merge' | 'squash' | 'rebase'
  } | null> {
    const config = await this.load()
    const pathParts = projectPath.split('/')
    const project = this.findProjectByPath(config.projects, pathParts)

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
    let strategy: string | undefined
    let mergeMethod: 'merge' | 'squash' | 'rebase' | undefined

    if (envName && project.environments) {
      // Find environment config by name
      const envConfig = project.environments.find(e => e.name === envName)
      if (envConfig) {
        targetBranch = envConfig.branch
        mergeFrom = envConfig.merge_from
        strategy = envConfig.merge_strategy
        mergeMethod = envConfig.merge_method
      }
    } else if (projectRepos?.branch) {
      targetBranch = projectRepos.branch
    } else if (globalGit?.default_branch) {
      targetBranch = globalGit.default_branch
    }

    // Merge configuration (project takes precedence)
    return {
      url,
      branch: targetBranch,
      username: projectRepos?.username || globalGit?.username,
      password: projectRepos?.password || globalGit?.password,
      merge_from: mergeFrom,
      strategy: strategy,
      merge_method: mergeMethod
    }
  }

  /**
   * Get SSH configuration
   */
  async getSshConfig(serverName: string): Promise<{
    server: string
    user: string
    privateKeyFile?: string
    port?: number
  } | null> {
    const config = await this.load()
    const sshConfig = config.omniflow.ssh?.[serverName]
    return sshConfig || null
  }

  /**
   * Resolve environment variables in configuration
   */
  private resolveEnvVars(config: any): OmniflowConfig {
    const resolve = (value: any): any => {
      if (typeof value === 'string') {
        return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
          return process.env[varName] || `\${${varName}}`
        })
      }

      if (Array.isArray(value)) {
        return value.map(resolve)
      }

      if (value && typeof value === 'object') {
        const resolved: any = {}
        for (const [key, val] of Object.entries(value)) {
          resolved[key] = resolve(val)
        }
        return resolved
      }

      return value
    }

    return resolve(config)
  }

  /**
   * Reload configuration (fetches from git again)
   */
  async reload(): Promise<void> {
    this.config = null
    await this.load()
  }

  /**
   * Update config from git repository
   * Fetches the latest config.yaml and commands.js from the config repo
   */
  async updateConfig(): Promise<void> {
    const {
      OMNIFLOW_CONFIG_REPO,
      OMNIFLOW_CONFIG_BRANCH = 'main',
      OMNIFLOW_CONFIG_FILE = 'config.yaml',
      OMNIFLOW_COMMANDS_FILE = 'commands.js',
      GIT_USERNAME,
      GIT_PASSWORD
    } = process.env

    if (!OMNIFLOW_CONFIG_REPO) {
      throw new Error('OMNIFLOW_CONFIG_REPO environment variable is required')
    }

    const OMNIFLOW_HOME = process.env.OMNIFLOW_HOME || path.join(os.homedir(), '.omniflow')
    const configDir = path.join(OMNIFLOW_HOME, 'config')

    // Build authenticated URL
    let repoUrl = OMNIFLOW_CONFIG_REPO
    if (GIT_USERNAME && GIT_PASSWORD) {
      try {
        const urlObj = new URL(OMNIFLOW_CONFIG_REPO)
        urlObj.username = GIT_USERNAME
        urlObj.password = GIT_PASSWORD
        repoUrl = urlObj.toString()
      } catch {
        // Invalid URL, use as-is
      }
    }

    // Clone to a temporary location
    const tempDir = path.join(OMNIFLOW_HOME, '.tmp_config')
    await fs.mkdir(tempDir, { recursive: true })

    try {
      const cloneCmd = `git clone --depth 1 --branch ${OMNIFLOW_CONFIG_BRANCH} --single-branch ${repoUrl} ${tempDir}`
      await execAsync(cloneCmd, {
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })

      // Ensure config directory exists
      await fs.mkdir(configDir, { recursive: true })

      // Copy config.yaml
      const tempConfigPath = path.join(tempDir, OMNIFLOW_CONFIG_FILE)
      const configContent = await fs.readFile(tempConfigPath, 'utf-8')
      await fs.writeFile(path.join(configDir, OMNIFLOW_CONFIG_FILE), configContent, 'utf-8')

      // Copy commands.js if it exists
      const tempCommandsPath = path.join(tempDir, OMNIFLOW_COMMANDS_FILE)
      try {
        await fs.access(tempCommandsPath)
        const commandsContent = await fs.readFile(tempCommandsPath, 'utf-8')
        await fs.writeFile(path.join(configDir, OMNIFLOW_COMMANDS_FILE), commandsContent, 'utf-8')
      } catch {
        // commands.js doesn't exist, skip
      }
    } finally {
      // Clean up temp directory
      await fs.rm(tempDir, { recursive: true, force: true })
    }

    // Reload config
    this.config = null
    await this.load()
  }

  /**
   * Collect vars from the project path (traverses folder hierarchy)
   * Returns vars from all folders in the path + the project itself
   */
  private async collectVarsFromPath(pathParts: string[]): Promise<Record<string, string>> {
    const config = await this.load()
    const vars: Record<string, string> = {}

    // Start with global vars
    Object.assign(vars, config.omniflow.env || {})

    // Traverse the path and collect vars from each folder
    let currentItems = config.projects
    for (const part of pathParts) {
      const item = currentItems.find(i => i.name === part)
      if (!item) break

      // Merge vars from this level (folder or project)
      if (item.vars) {
        Object.assign(vars, item.vars)
      }

      // Move to next level if this is a folder
      if (item.items) {
        currentItems = item.items
      } else {
        break // Reached a project, stop traversing
      }
    }

    return vars
  }

  /**
   * Get merged variables for a project and environment
   * Priority: global -> parent folders -> project -> environment (later overrides earlier)
   */
  async getMergedVars(projectPath: string, envName: string): Promise<Record<string, string>> {
    const envConfig = await this.getEnvironment(projectPath, envName)
    if (!envConfig) {
      throw new Error(`Environment not found: ${envName}`)
    }

    // Collect vars from: global -> folders -> project
    const pathVars = await this.collectVarsFromPath(projectPath.split('/'))

    // Merge with environment vars (highest priority)
    return {
      ...pathVars,           // global -> folders -> project
      ...envConfig.vars      // environment vars (override all)
    }
  }

  /**
   * Load commands.js from omniflow home directory
   * Returns the exported object or null if file doesn't exist
   */
  async loadCommands(): Promise<Object | null> {
    const {
      OMNIFLOW_COMMANDS_FILE = 'commands.js'
    } = process.env

    const OMNIFLOW_HOME = process.env.OMNIFLOW_HOME || path.join(os.homedir(), '.omniflow')
    const commandsPath = path.join(OMNIFLOW_HOME, 'config', OMNIFLOW_COMMANDS_FILE)

    try {
      // Check if file exists
      await fs.access(commandsPath)

      // Dynamic import of commands.js
      const commandsModule = await import(commandsPath)

      // Return the default export or the module itself
      return commandsModule.default || commandsModule
    } catch {
      // File doesn't exist or import failed
      return null
    }
  }

  /**
   * Get the data directory path for projects
   * Maps to ~/.omniflow/data/
   */
  getDataDir(): string {
    const OMNIFLOW_HOME = process.env.OMNIFLOW_HOME || path.join(os.homedir(), '.omniflow')
    return path.join(OMNIFLOW_HOME, 'data')
  }

  /**
   * Get project path by project key (e.g., "omni-gate/platform" -> ~/.omniflow/data/omni-gate/platform)
   */
  getProjectPath(projectKey: string): string {
    return path.join(this.getDataDir(), projectKey)
  }
}

/**
 * Load Omniflow configuration from git
 * Configuration is fetched from the repository specified by OMNIFLOW_CONFIG_REPO
 * @returns The loaded configuration
 */
export async function loadOmniflowConfig(): Promise<OmniflowConfig> {
  const loader = new OmniflowConfigLoader()
  return await loader.load()
}

