// Omniflow configuration loader

import path from 'path'
import { promises as fs } from 'fs'
import YAML from 'yaml'
import type {
  OmniflowConfig,
  EnvironmentConfig,
  ProjectNode
} from '../types/config.js'
import { collectVarsFromPath, getMergedVars as mergeVars } from './vars.js'
import { SettingsManager, settingsManager } from './settings.js'
import { ProjectManager } from './projects.js'
import { getGitConfig } from './git.js'

export { SettingsManager, settingsManager } from './settings.js'
export { ProjectManager } from './projects.js'
export { getGitConfig } from './git.js'

export type { OmniflowSettings } from './settings.js'

export class OmniflowConfigLoader {
  private config: OmniflowConfig | null = null
  private initialized = false
  private projectManager: ProjectManager | null = null

  /**
   * Get settings manager instance
   */
  private get settings(): SettingsManager {
    return settingsManager
  }

  /**
   * Ensure configuration is initialized (fetch from git if needed)
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return

    // Get config values from settings
    const OMNIFLOW_CONFIG_REPO = await this.settings.getConfigRepo()
    const OMNIFLOW_CONFIG_BRANCH = await this.settings.getConfigBranch()
    const { username, password } = await this.settings.getGitCredentials()
    const OMNIFLOW_HOME = await this.settings.getOmniflowHome()
    const OMNIFLOW_CONFIG_FILE = process.env.OMNIFLOW_CONFIG_FILE || 'config.yaml'

    // If no config repo, prompt for interactive setup
    if (!OMNIFLOW_CONFIG_REPO) {
      const setupResult = await this.settings.promptForInitialSetup()
      if (!setupResult) {
        throw new Error(
          '\n❌ Configuration error: OMNIFLOW_CONFIG_REPO is required\n' +
          'Set it via:\n' +
          '  export OMNIFLOW_CONFIG_REPO=https://your-git-repo/config.git\n' +
          'Or run: omniflow init\n'
        )
      }
      // Retry with new settings
      return this.ensureInitialized()
    }

    // Config directory - ~/.omniflow/config/
    const configDir = path.join(OMNIFLOW_HOME, 'config')
    const configPath = path.join(configDir, OMNIFLOW_CONFIG_FILE)

    // Check if config file exists
    const configExists = await fs.access(configPath).then(() => true).catch(() => false)

    if (configExists) {
      this.initialized = true
      return
    }

    // Build authenticated URL
    const repoUrl = this.settings.buildAuthenticatedUrl(OMNIFLOW_CONFIG_REPO, username, password)

    // Clone config repository
    console.log(`\n📋 Initializing omniflow configuration...`)
    console.log(`   Repository: ${OMNIFLOW_CONFIG_REPO}`)
    console.log(`   Branch: ${OMNIFLOW_CONFIG_BRANCH}`)
    console.log(`   Target: ${configDir}\n`)

    try {
      // Clone the config repository
      const { execaCommand } = await import('execa')
      await execaCommand(`git clone --depth 1 --branch ${OMNIFLOW_CONFIG_BRANCH} --single-branch ${repoUrl} ${configDir}`, {
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })

      // Verify config.yaml exists
      await fs.access(configPath)

      console.log('✅ Configuration initialized\n')
    } catch (error) {
      console.error(`\n❌ Failed to initialize configuration: ${(error as Error).message}\n`)
      console.error('Please check:')
      console.error('  - Repository URL is correct')
      console.error('  - Git authentication is configured')
      console.error('  - Network connectivity\n')
      throw error
    }

    this.initialized = true
  }

  /**
   * Load configuration
   * Uses cached config if available, otherwise fetches from git
   */
  async load(): Promise<OmniflowConfig> {
    if (this.config) {
      return this.config
    }

    // Ensure configuration is initialized
    await this.ensureInitialized()

    // Get paths
    const OMNIFLOW_HOME = await this.settings.getOmniflowHome()
    const OMNIFLOW_CONFIG_FILE = process.env.OMNIFLOW_CONFIG_FILE || 'config.yaml'
    const configPath = path.join(OMNIFLOW_HOME, 'config', OMNIFLOW_CONFIG_FILE)

    try {
      const content = await fs.readFile(configPath, 'utf-8')
      const rawConfig = YAML.parse(content)

      // Validate required fields
      if (!rawConfig.omniflow) {
        throw new Error('Missing "omniflow" section in configuration')
      }

      if (!rawConfig.projects) {
        throw new Error('Missing "projects" section in configuration')
      }

      this.config = this.resolveEnvVars(rawConfig)

      // Initialize project manager with loaded config
      this.projectManager = new ProjectManager(this.config)

      return this.config
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new Error(`Configuration file not found: ${configPath}`)
      }
      throw error
    }
  }

  /**
   * Get project manager instance
   */
  private async getProjectManager(): Promise<ProjectManager> {
    if (!this.projectManager) {
      await this.load()
    }
    return this.projectManager!
  }

  /**
   * Get a specific project configuration by path
   * @param projectPath Project path like "omni-gate/platform" or "platform"
   */
  async getProject(projectPath: string): Promise<any> {
    const pm = await this.getProjectManager()
    return pm.getProject(projectPath)
  }

  /**
   * Get all projects (flattened, excluding folders)
   */
  async listProjects(): Promise<Array<{ key: string; name: string; description?: string }>> {
    const pm = await this.getProjectManager()
    return pm.listProjects()
  }

  /**
   * List all items (including folders) with their structure
   */
  async listProjectTree(): Promise<ProjectNode[]> {
    const pm = await this.getProjectManager()
    return pm.listProjectTree()
  }

  /**
   * Get environment configuration for a project
   * @param projectPath Project path like "omni-gate/platform"
   * @param envName Environment name like "test" or "prod"
   */
  async getEnvironment(projectPath: string, envName: string): Promise<EnvironmentConfig | null> {
    const pm = await this.getProjectManager()
    return pm.getEnvironment(projectPath, envName)
  }

  /**
   * List environments for a project
   * @param projectPath Project path like "omni-gate/platform"
   */
  async listEnvironments(projectPath: string): Promise<string[]> {
    const pm = await this.getProjectManager()
    return pm.listEnvironments(projectPath)
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
  } | null> {
    const config = await this.load()
    return getGitConfig(config, projectPath, envName)
  }

  /**
   * Resolve environment variables in configuration
   * Variables are resolved from: omniflow.env -> process.env
   */
  private resolveEnvVars(config: any): OmniflowConfig {
    // Build variable lookup: omniflow.env takes priority, then process.env
    const varLookup: Record<string, string> = {
      ...process.env,
      ...(config.omniflow?.env || {})
    }

    const resolve = (value: any): any => {
      if (typeof value === 'string') {
        return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
          return varLookup[varName] || `\${${varName}}`
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
   * Update configuration (fetches from git again)
   */
  async update(): Promise<void> {
    // Get config values from settings
    const OMNIFLOW_CONFIG_REPO = await this.settings.getConfigRepo()
    const OMNIFLOW_CONFIG_BRANCH = await this.settings.getConfigBranch()
    const { username, password } = await this.settings.getGitCredentials()
    const OMNIFLOW_HOME = await this.settings.getOmniflowHome()
    const configDir = path.join(OMNIFLOW_HOME, 'config')

    // If no config repo, prompt for interactive setup
    if (!OMNIFLOW_CONFIG_REPO) {
      const setupResult = await this.settings.promptForInitialSetup()
      if (!setupResult) {
        throw new Error(
          '\n❌ Configuration error: OMNIFLOW_CONFIG_REPO is required\n' +
          'Set it via environment variable or run initial setup\n'
        )
      }
      // Retry with new settings
      return this.update()
    }

    console.log('🔄 Fetching latest configuration from git...')

    try {
      const { execaCommand } = await import('execa')

      // Check if config directory exists
      const configExists = await fs.access(configDir).then(() => true).catch(() => false)

      if (!configExists) {
        // Directory doesn't exist, clone the repository
        console.log(`   Config directory not found, cloning...`)

        // Build authenticated URL
        const repoUrl = this.settings.buildAuthenticatedUrl(OMNIFLOW_CONFIG_REPO, username, password)

        // Create parent directory if needed
        await fs.mkdir(OMNIFLOW_HOME, { recursive: true })

        // Clone the config repository
        await execaCommand(`git clone --depth 1 --branch ${OMNIFLOW_CONFIG_BRANCH} --single-branch ${repoUrl} ${configDir}`, {
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        })
      } else {
        // Directory exists, fetch latest changes and force reset to remote
        await execaCommand('git fetch origin', { cwd: configDir })
        await execaCommand(`git checkout ${OMNIFLOW_CONFIG_BRANCH}`, { cwd: configDir })
        // Force reset to remote branch, ignoring local changes
        await execaCommand(`git reset --hard origin/${OMNIFLOW_CONFIG_BRANCH}`, { cwd: configDir })
        // Clean untracked files
        await execaCommand('git clean -fd', { cwd: configDir })
      }

      // Clear cache
      this.config = null
      this.initialized = false
      this.projectManager = null

      // Reload
      await this.load()

      console.log('✅ Configuration updated\n')
    } catch (error) {
      throw new Error(`Failed to reload configuration: ${(error as Error).message}`)
    }
  }

  /**
   * Get merged variables for a project and environment
   * Priority: global -> parent folders -> project -> environment (later overrides earlier)
   * Array values are merged, string values are overridden
   */
  async getMergedVars(projectPath: string, envName: string): Promise<Record<string, string | string[]>> {
    const envConfig = await this.getEnvironment(projectPath, envName)
    if (!envConfig) {
      throw new Error(`Environment not found: ${envName}`)
    }

    const config = await this.load()

    // Collect vars from: global -> folders -> project
    const pathVars = collectVarsFromPath(projectPath.split('/'), config.omniflow.env, config.projects)

    // Merge with environment vars (highest priority)
    return mergeVars(pathVars, envConfig)
  }

  /**
   * Load commands.js from omniflow config directory
   * Commands file is at OMNIFLOW_HOME/config/commands.js
   * Returns the exported object or null if file doesn't exist
   */
  async loadCommands(): Promise<Object | null> {
    const OMNIFLOW_HOME = await this.settings.getOmniflowHome()
    const OMNIFLOW_COMMANDS_FILE = process.env.OMNIFLOW_COMMANDS_FILE || 'commands.js'
    const commandsPath = path.join(OMNIFLOW_HOME, 'config', OMNIFLOW_COMMANDS_FILE)

    try {
      // Check if file exists
      await fs.access(commandsPath)

      // Dynamic import of commands.js
      const commandsModule = await import(commandsPath)

      // Debug: log what we got
      console.log(`  🔍 Debug: commandsModule keys: ${Object.keys(commandsModule).join(', ')}`)
      console.log(`  🔍 Debug: commandsModule.default: ${commandsModule.default ? 'exists' : 'null'}`)
      if (commandsModule.default) {
        console.log(`  🔍 Debug: commandsModule.default keys: ${Object.keys(commandsModule.default).join(', ')}`)
      }

      // Return the default export or the module itself
      return commandsModule.default || commandsModule
    } catch {
      // File doesn't exist or import failed
      return null
    }
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