import type {CommandDefinition} from '../../types/config.js'
import {$} from 'zx'
import path from "path";
import {OmniflowConfigLoader} from "../../config";
import {EnvironmentConfig} from "../../types/config";
import git from "../../core/git.js";
import {RunOptions, ScriptContext} from "./types.js";
import nodeActions from "../../core/node";
import sshActions from "../../core/ssh";
import webActions from "../../core/web";
import dockerActions from "../../core/docker";
import * as utils from "../utils";

interface ExecuteCommand {
    name: string;
    def?: CommandDefinition
}

export default class CommandExecutor {

    private readonly projectKey: string;
    private readonly envName: string;
    private commands: Array<ExecuteCommand>;
    private readonly options: RunOptions;
    private readonly omniflowHome: string;
    private readonly projectRoot: string;
    private readonly loader: OmniflowConfigLoader;
    private project!: any;
    private envConfig!: EnvironmentConfig;
    private context!: ScriptContext;

    /**
     * Create a new CommandExecutor
     * @param omniflowHome - Omniflow home directory
     * @param projectKey - Project identifier (e.g., 'team/project')
     * @param envName - Environment name (e.g., 'dev', 'prod')
     * @param commands - Array of command names to execute
     * @param options - Execution options
     */
    constructor(omniflowHome: string, projectKey: string, envName: string, commands: string[], options: RunOptions) {
        this.omniflowHome = omniflowHome;
        this.projectKey = projectKey;
        this.envName = envName;
        this.commands = commands.map((cmd: string) => ({name: cmd}));
        this.options = options;
        this.projectRoot = path.join(this.omniflowHome, 'project', ...projectKey.split('/'));
        this.loader = new OmniflowConfigLoader();
    }

    /**
     * Prepare execution context
     * Loads project config, maps command names to definitions, fetches project, builds context
     */
    private async prepare(): Promise<void> {
        this.project = await this.loader.getProject(this.projectKey)
        this.envConfig = await this.loader.getEnvironment(this.projectKey, this.envName)

        // Map command names to their definitions
        for (const cmd of this.commands) {
            const def = this.project.commands?.find((c: any) => c.name === cmd.name)
            if (def) {
                cmd.def = def
            } else {
                console.error(`❌ Command not found: ${cmd.name}`)
                if (this.project.commands && this.project.commands.length > 0) {
                    console.log(`\nAvailable commands:`)
                    for (const c of this.project.commands) {
                        console.log(`  - ${c.name}${c.description ? ': ' + c.description : ''}`)
                    }
                }
                throw new Error(`Command not found: ${cmd.name}`)
            }
        }

        if (this.commands.length === 0) {
            console.log(`\n📋 Available commands for ${this.projectKey}:\n`)
            if (!this.project.commands || this.project.commands.length === 0) {
                console.log(`  No commands defined`)
            } else {
                for (const cmd of this.project.commands) {
                    console.log(`  ${cmd.name}${cmd.description ? ' - ' + cmd.description : ''}`)
                }
            }
            console.log(`\nUsage: omniflow run -e ${this.envName} ${this.projectKey} <command> [command...]`)
            throw new Error("Invalid command name");
        }
        console.log(`\n🚀 Running: ${this.project.name || this.projectKey}`)
        console.log(`   Project: ${this.projectKey}`)
        console.log(`   Environment: ${this.envName}`)
        console.log(`   Commands: ${this.commands.map(c => c.name).join(', ')}`)
        console.log(`   Workspace: ${this.projectRoot}`)
        console.log('');

        const mergedVars = await this.loader.getMergedVars(this.projectKey, this.envName);
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
        };
        await this.fetchProject();
        const sharedCommands = await this.loader.loadCommands(actions);
        this.context = {
            workspace: this.projectRoot,
            projectRoot: this.projectRoot,
            project: this.project.name,
            environment: this.envName,
            commands: sharedCommands,
            actions: actions,
            utils: utils,
            env: mergedVars,
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
        const gitConfig = await this.loader.getGitConfig(this.projectKey, this.envName);
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
     * @param commandDef - Command definition with script path and metadata
     */
    private async executeCommand(commandDef: CommandDefinition) {
        // Determine command root directory (projectRoot + folder if specified)
        const commandRoot = commandDef.folder
            ? path.join(this.projectRoot, commandDef.folder)
            : this.projectRoot

        if (this.options.verbose) {
            console.log(`\n📜 Command: ${commandDef.name}`)
            console.log(`   Command Root: ${commandRoot}`)
            console.log(`   App name: ${commandDef.appName}`)
            console.log(`   Args: ${JSON.stringify(commandDef.args || {})}`)
        }

        if (this.options.dryRun) {
            console.log(`[DRY RUN] Would execute command: ${commandDef.name}\n`)
        } else {
            const scriptPath = path.join(commandRoot, commandDef.script);
            const resolvedScriptPath = path.resolve(scriptPath)
            const scriptModule = await import(resolvedScriptPath)

            if (typeof scriptModule.default === 'function') {
                await scriptModule.default(this.context, commandDef.folder, commandDef.appName, commandDef.args)
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
            const commandName = command.name;
            console.log(`\n${'─'.repeat(50)}`)
            console.log(`📋 [${i + 1}/${this.commands.length}] Running: ${commandName}${command.def?.description ? ' - ' + command.def?.description : ''}`)
            if (command.def) {
                await this.executeCommand(command.def);
            } else {
                console.log(`Missing command: ${commandName}`);
                throw new Error(`Missing command: ${commandName}`)
            }
            console.log(`${'─'.repeat(50)}`);

        }
    }
}