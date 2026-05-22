// Omniflow configuration loader

import path from 'path'
import {promises as fs} from 'fs'
import YAML from 'yaml'
import type {
    OmniflowConfig,
    EnvironmentConfig,
    ProjectNode
} from '../types/config.js'
import {getMergedVars as mergeVars, VarValue} from './vars.js'
import {SettingsManager, settingsManager} from './settings.js'
import {ProjectManager} from './projects.js'
import {getGitConfig} from './git.js'
import * as utils from "../cli/utils/index.js"

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
        const {username, password} = await this.settings.getGitCredentials()
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
            const {execaCommand} = await import('execa')
            await execaCommand(`git clone --depth 1 --branch ${OMNIFLOW_CONFIG_BRANCH} --single-branch ${repoUrl} ${configDir}`, {
                env: {...process.env, GIT_TERMINAL_PROMPT: '0'}
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

    private async loadConfigFile(configPath: string) {
        try {
            const content = await fs.readFile(configPath, 'utf-8')
            return YAML.parse(content)
        } catch (error) {
            if ((error as any).code === 'ENOENT') {
                throw new Error(`Configuration file not found: ${configPath}`)
            }
            throw error
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

        // Ensure configuration is initialized
        await this.ensureInitialized()

        // Get paths
        const OMNIFLOW_HOME = await this.settings.getOmniflowHome()
        const OMNIFLOW_CONFIG_FILE = process.env.OMNIFLOW_CONFIG_FILE || 'config.yaml'
        const configPath = path.join(OMNIFLOW_HOME, 'config', OMNIFLOW_CONFIG_FILE)

        const rawConfig = await this.loadConfigFile(configPath)

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
     * Get all projects (flattened, excluding folders)
     */
    async listProjects(): Promise<Array<{ key: string; name: string; description?: string }>> {
        const pm = await this.getProjectManager()
        return pm.listProjects()
    }

    /**
     * Get a specific project configuration by path
     * @param projectPath Project path like "omni-gate/platform" or "platform"
     */
    async getProject(projectPath: string): Promise<any> {
        const pm = await this.getProjectManager();
        const project = pm.getProject(projectPath)
        if (!project) {
            console.error(`❌ Project not found: ${projectPath}`)
            const available = await this.listProjects()
            if (available.length > 0) {
                console.log(`\nAvailable projects: ${available.map((p: any) => p.key).join(', ')}`)
            }
            throw new Error(`${projectPath} not found`);
        }
        return project
    }

    /**
     * List all items (including folders) with their structure
     */
    async listProjectTree(): Promise<ProjectNode[]> {
        const pm = await this.getProjectManager()
        return pm.listProjectTree()
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
     * Get environment configuration for a project
     * @param projectPath Project path like "omni-gate/platform"
     * @param envName Environment name like "test" or "prod"
     */
    async getEnvironment(projectPath: string, envName: string): Promise<EnvironmentConfig> {
        const pm = await this.getProjectManager()
        let envConfig = pm.getEnvironment(projectPath, envName);
        if (!envConfig) {
            console.error(`❌ Environment not found: ${envName}`)
            const available = await this.listEnvironments(projectPath)
            if (available.length > 0) {
                console.log(`\nAvailable environments: ${available.join(', ')}`)
            }
            throw new Error(`Environment not found: ${envName} in project: ${projectPath}`);
        }
        return envConfig;
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
        strategy: string
    }> {
        const config = await this.load()
        const gitConfig = getGitConfig(config, projectPath, envName);
        if (!gitConfig) {
            console.error(`❌ Git configuration not found for project: ${projectPath}`);
            throw new Error(`Git configuration not found for project: ${projectPath}`);
        }
        return gitConfig;
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
        const {username, password} = await this.settings.getGitCredentials()
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
            const {execaCommand} = await import('execa')

            // Check if config directory exists
            const configExists = await fs.access(configDir).then(() => true).catch(() => false)

            if (!configExists) {
                // Directory doesn't exist, clone the repository
                console.log(`   Config directory not found, cloning...`)

                // Build authenticated URL
                const repoUrl = this.settings.buildAuthenticatedUrl(OMNIFLOW_CONFIG_REPO, username, password)

                // Create parent directory if needed
                await fs.mkdir(OMNIFLOW_HOME, {recursive: true})

                // Clone the config repository
                await execaCommand(`git clone --depth 1 --branch ${OMNIFLOW_CONFIG_BRANCH} --single-branch ${repoUrl} ${configDir}`, {
                    env: {...process.env, GIT_TERMINAL_PROMPT: '0'}
                })
            } else {
                // Directory exists, fetch latest changes and force reset to remote
                await execaCommand('git fetch origin', {cwd: configDir})
                await execaCommand(`git checkout ${OMNIFLOW_CONFIG_BRANCH}`, {cwd: configDir})
                // Force reset to remote branch, ignoring local changes
                await execaCommand(`git reset --hard origin/${OMNIFLOW_CONFIG_BRANCH}`, {cwd: configDir})
                // Clean untracked files
                await execaCommand('git clean -fd', {cwd: configDir})
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
     * Priority: omniflow.env -> envConfig.vars (later overrides earlier)
     * String values override, array and object values are merged
     */
    async getMergedVars(projectPath: string, envName: string): Promise<Record<string, VarValue>> {
        const envConfig = await this.getEnvironment(projectPath, envName)
        if (!envConfig) {
            throw new Error(`Environment not found: ${envName}`)
        }

        const config = await this.load()

        // Start with global vars
        const result: Record<string, VarValue> = {...(config.omniflow?.env || {})}

        // Merge with environment vars (highest priority)
        return mergeVars(result, envConfig)
    }

    /**
     * Load commands.js from omniflow config directory
     * Commands file is at OMNIFLOW_HOME/config/commands.js
     *
     * The file must export a default function:
     * export default function loadCommands(actions, utils) {
     *   return { myAction: async (opts) => { ... } }
     * }
     *
     * Returns the commands object or empty object if file doesn't exist
     */
    async loadCommands(actions: any): Promise<Object> {
        const OMNIFLOW_HOME = await this.settings.getOmniflowHome()
        const commandsPath = path.join(OMNIFLOW_HOME, 'config', 'commands.js')

        // Check if file exists
        try {
            await fs.access(commandsPath)
        } catch {
            // File doesn't exist, return empty object
            return {}
        }

        // File exists, load and call loadCommands function
        try {
            const commandsModule = await import(commandsPath)
            if (typeof commandsModule.default !== 'function') {
                throw new Error(`commands.js must export a default function: ${commandsPath}`)
            }
            const commands = commandsModule.default(actions, utils)
            return commands || {}
        } catch (error) {
            throw new Error(`Failed to load commands from ${commandsPath}: ${(error as Error).message}`)
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