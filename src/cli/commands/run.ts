/**
 * Omniflow Run Command
 *
 * Executes deployment scripts for a project in a specific environment.
 * Scripts receive (context, folder, appName, args) parameters:
 * - context: Contains workspace, project info, actions, utils, etc.
 * - folder: Command's subdirectory (optional, from command.folder)
 * - appName: Application name (optional, from command.appName)
 * - args: Command-specific arguments from command.args
 *
 * @example
 * ```ts
 * // omniflow/build_docker.js
 * export default async (ctx, folder, appName, args) => {
 *   const { projectName } = args
 *   await ctx.actions.docker.compose(workDir, tplFile)
 * }
 * ```
 */


import { settingsManager} from '../../config/index.js'
import {RunOptions, ScriptContext} from "./types.js";
import CommandExecutor from "./CommandExecutor";


/**
 * Execute omniflow commands for a project
 *
 * @param projectKey - Project identifier (e.g., 'team/project')
 * @param envName - Environment name (e.g., 'dev', 'prod')
 * @param commands - Array of command names to execute
 * @param options - Execution options
 *
 * @example
 * ```ts
 * await runCommand('myapp/web', 'prod', ['build', 'deploy'], {
 *   dryRun: false,
 *   verbose: true
 * })
 * ```
 */
export async function runCommand(projectKey: string, envName: string, commands: string[], options: RunOptions): Promise<void> {

    const OMNIFLOW_HOME = await settingsManager.getOmniflowHome()

    // Load configuration
    const executor = new CommandExecutor(OMNIFLOW_HOME, projectKey, envName, commands, options);
}