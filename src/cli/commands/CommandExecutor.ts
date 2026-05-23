import type {CommandDefinition, ModuleConfig} from '../../types/config.js'
import {$} from '../../core/shell.js'
import path from "path"
import {OmniflowConfigLoader} from "../../config/index.js"
import {EnvironmentConfig} from "../../types/config.js"
import git from "../../core/git.js"
import {RunOptions, ScriptContext} from "./types.js"
import nodeActions from "../../core/node.js"
import sshActions from "../../core/ssh.js"
import webActions from "../../core/web.js"
import dockerActions from "../../core/docker.js"
import *as utils from "../utils/index.js"

interface ExecuteCommand {
    fullName: string  // 完整命令名 (module/command)
    moduleName: string  // 模块名
    commandName: string  // 命令名
    def?: CommandDefinition
    module?: ModuleConfig
}

export default class CommandExecutor {

    private readonly projectKey: string
    private readonly envName: string
    private commands: Array<ExecuteCommand>
    private readonly options: RunOptions
    private readonly omniflowHome: string
    private readonly projectRoot: string
    private readonly loader: OmniflowConfigLoader
    private project!: any
    private envConfig!: EnvironmentConfig
    private context!: ScriptContext

    /**
     * Create a new CommandExecutor
     * @param omniflowHome - Omniflow home directory
     * @param projectKey - Project identifier (e.g., 'team/project')
     * @param envName - Environment name (e.g., 'dev', 'prod')
     * @param commands - Array of command specs in format 'module/command' or 'command' (uses default module)
     * @param options - Execution options
     */
    constructor(omniflowHome: string, projectKey: string, envName: string, commands: string[], options: RunOptions) {
        this.omniflowHome = omniflowHome
        this.projectKey = projectKey
        this.envName = envName
        this.options = options
        this.loader = OmniflowConfigLoader.getInstance()
        this.projectRoot = path.join(this.omniflowHome, 'project', ...projectKey.split('/'))

        // 解析命令: 支持格式 "module/command" 或 "command"
        this.commands = commands.map((cmd: string) => {
            const parts = cmd.split('/')
            if (parts.length === 2) {
                return { fullName: cmd, moduleName: parts[0], commandName: parts[1] }
            } else {
                // 只指定命令名，moduleName 留空，后续在 prepare 中处理
                return { fullName: cmd, moduleName: '', commandName: cmd }
            }
        })
    }

    /**
     * Prepare execution context
     * Loads project config, maps command names to definitions, fetches project, builds context
     */
    private async prepare(): Promise<void> {
        // Load config first (async)
        await this.loader.load()

        // Get project and environment (sync methods now)
        this.project = this.loader.getProject(this.projectKey)
        this.envConfig = this.loader.getEnvironment(this.projectKey, this.envName)

        // Helper: 在指定模块中查找命令
        const findCommandInModule = (moduleName: string, commandName: string): { def: CommandDefinition; module: ModuleConfig } | null => {
            const modules = this.project.modules || []
            const mod = modules.find((m: ModuleConfig) => m.name === moduleName)
            if (!mod) return null
            const cmd = mod.commands?.find((c: CommandDefinition) => c.name === commandName)
            if (cmd) {
                return { def: cmd, module: mod }
            }
            return null
        }

        // Helper: 在所有模块中查找命令
        const findCommandInAnyModule = (commandName: string): { def: CommandDefinition; module: ModuleConfig } | null => {
            const modules = this.project.modules || []
            for (const mod of modules) {
                const cmd = mod.commands?.find((c: CommandDefinition) => c.name === commandName)
                if (cmd) {
                    return { def: cmd, module: mod }
                }
            }
            return null
        }

        // Helper: 列出所有可用命令
        const listAvailableCommands = () => {
            const modules = this.project.modules || []
            if (modules.length === 0) {
                console.log(`  No modules defined`)
                return
            }
            for (const mod of modules) {
                if (mod.commands && mod.commands.length > 0) {
                    console.log(`\n  Module: ${mod.name}${mod.description ? ' - ' + mod.description : ''}`)
                    for (const cmd of mod.commands) {
                        console.log(`    - ${cmd.name}${cmd.description ? ': ' + cmd.description : ''}`)
                    }
                }
            }
        }

        // Map command names to their definitions
        for (const cmd of this.commands) {
            let found = null
            if (cmd.moduleName) {
                // 格式: module/command - 在指定模块中查找
                found = findCommandInModule(cmd.moduleName, cmd.commandName)
            } else {
                // 只有命令名 - 在所有模块中查找
                found = findCommandInAnyModule(cmd.commandName)
                if (found) {
                    cmd.moduleName = found.module.name
                }
            }

            if (found) {
                cmd.def = found.def
                cmd.module = found.module
            } else {
                console.error(`❌ Command not found: ${cmd.fullName}`)
                console.log(`\nAvailable commands:`)
                listAvailableCommands()
                throw new Error(`Command not found: ${cmd.fullName}`)
            }
        }

        if (this.commands.length === 0) {
            console.log(`\n📋 Available commands for ${this.projectKey}:\n`)
            listAvailableCommands()
            console.log(`\nUsage: omniflow run -e ${this.envName} ${this.projectKey} <module/command> [module/command...]`)
            throw new Error("Invalid command name")
        }
        console.log(`\n🚀 Running: ${this.project.name || this.projectKey}`)
        console.log(`   Project: ${this.projectKey}`)
        console.log(`   Environment: ${this.envName}`)
        console.log(`   Commands: ${this.commands.map(c => c.fullName).join(', ')}`)
        console.log(`   Workspace: ${this.projectRoot}`)
        console.log('')

        // Get merged vars and SSH config (sync methods now)
        const mergedVars = this.loader.getMergedVars(this.projectKey, this.envName)
        const sshConfig = this.loader.getSshConfig()

        const actions = {
            shell: {
                exec: async (cmd: string) => {
                    const result = await $`${cmd}`
                    return {stdout: result.stdout, stderr: result.stderr}
                }
            },
            git: {
                clone: git.clone
            },
            node: nodeActions,
            ssh: sshActions,
            web: webActions,
            docker: dockerActions
        }

        await this.fetchProject()

        const sharedCommands = await this.loader.loadCommands(actions)

        this.context = {
            workspace: this.projectRoot,
            projectRoot: this.projectRoot,
            project: this.project.name,
            environment: this.envName,
            commands: sharedCommands,
            actions: actions,
            utils: utils,
            env: mergedVars,
            sshConfig: sshConfig,
            verbose: this.options.verbose
        }

        if (this.options.verbose) {
            console.log(`\n📜 Base environment variables:`)
            console.log(`   OMNIFLOW_HOME=${this.omniflowHome}`)
            console.log(`   PROJECT_ROOT=${this.projectRoot}`)
            console.log(`   ENVIRONMENT=${this.envName}`)
            console.log('')
        }
    }

    /**
     * Fetch/sync project from git repository
     * Creates workspace and clones/updates the project
     */
    private async fetchProject() {
        const gitConfig = this.loader.getGitConfig(this.projectKey, this.envName)
        console.log(`   Branch: ${gitConfig.branch}`)
        if (gitConfig.merge_from) {
            console.log(`   (Remote merge: ${gitConfig.merge_from} → ${gitConfig.branch})`)
        }

        // Create workspace directory
        await $`mkdir -p ${this.projectRoot}`

        // Git workflow: clone
        if (this.options.verbose) {
            console.log(`🔄 Cloning: ${gitConfig.url}`)
        }

        await git.sync(
            {
                url: gitConfig.url,
                branch: gitConfig.branch,
                merge_from: this.envConfig.merge_from,
                strategy: gitConfig.strategy,
                username: gitConfig.username,
                password: gitConfig.password
            },
            this.projectRoot
        )

        if (this.options.verbose) {
            console.log(`✓ Git ready`)
        }
    }

    /**
     * Execute a single command script
     * @param commandDef - Command definition with metadata
     * @param module - Module configuration containing folder and appName
     */
    private async executeCommand(commandDef: CommandDefinition, module: ModuleConfig) {
        // Determine command root directory
        // If module.folder is specified, use it; otherwise use project root (for single-repo projects)
        const folder = module.folder || ''
        const commandRoot = folder ? path.join(this.projectRoot, folder) : this.projectRoot

        if (this.options.verbose) {
            console.log(`\n📜 Command: ${commandDef.name}`)
            console.log(`   Module: ${module.name}`)
            console.log(`   Folder: ${folder || '(root)'}`)
            console.log(`   AppName: ${module.appName || 'N/A'}`)
            console.log(`   Command Root: ${commandRoot}`)
            console.log(`   Args: ${JSON.stringify(commandDef.args || {})}`)
        }

        if (this.options.dryRun) {
            console.log(`[DRY RUN] Would execute command: ${commandDef.name}\n`)
        } else {
            // 脚本文件路径固定为 commandRoot/omniflow.js
            const scriptPath = path.join(commandRoot, 'omniflow.js')
            const resolvedScriptPath = path.resolve(scriptPath)
            const scriptModule = await import(resolvedScriptPath)

            if (typeof scriptModule.default === 'function') {
                // 传递 folder 用于路径解析（空字符串表示项目根目录）
                await scriptModule.default(this.context, folder, commandDef.args)
            } else {
                throw new Error(`Script must export a default function: ${resolvedScriptPath}`)
            }
        }
    }

    /**
     * Execute all commands in sequence
     * Prepares context, then runs each command one by one
     */
    async execute() {
        await this.prepare();
        for (let i = 0; i < this.commands.length; i++) {
            let command = this.commands[i];
            console.log(`\n${'─'.repeat(50)}`)
            console.log(`📋 [${i + 1}/${this.commands.length}] Running: ${command.fullName}${command.def?.description ? ' - ' + command.def?.description : ''}`)
            if (command.def && command.module) {
                await this.executeCommand(command.def, command.module);
            } else {
                console.log(`Missing command: ${command.fullName}`);
                throw new Error(`Missing command: ${command.fullName}`)
            }
            console.log(`${'─'.repeat(50)}`);

        }
    }
}