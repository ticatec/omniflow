/**
 * Omniflow Run Command
 *
 * Executes deployment scripts for a project module in a specific environment.
 * Scripts receive (context, folder, args) parameters:
 * - context: Contains workspace, project info, actions, utils, etc.
 * - folder: Module's subdirectory (from module.folder), empty string for root
 * - args: Command-specific arguments from command.args
 *
 * @example
 * ```ts
 * // omni-gateway/omniflow.js
 * export default async (ctx, folder, args) => {
 *   const { env } = ctx
 *   const projectRoot = folder ? path.resolve(ctx.projectRoot, folder) : ctx.projectRoot
 *   // ... build logic
 * }
 * ```
 */


import { settingsManager} from '../../config/index.js'
import {RunOptions} from "./types.js";
import CommandExecutor from "./CommandExecutor.js";


/**
 * Execute omniflow commands for a project
 *
 * @param projectKey - Project identifier (e.g., 'team/project')
 * @param envName - Environment name (e.g., 'dev', 'prod')
 * @param commands - Array of command specs in format "module/command" (e.g., ['backend/build', 'frontend/deploy'])
 * @param options - Execution options
 *
 * @example
 * ```ts
 * // Execute commands in different modules
 * await runCommand('myapp/web', 'prod', ['backend/build', 'frontend/deploy'], {
 *   dryRun: false,
 *   verbose: true
 * })
 * ```
 */
export async function runCommand(projectKey: string, envName: string, commands: string[], options: RunOptions): Promise<void> {

    const OMNIFLOW_HOME = await settingsManager.getOmniflowHome()

    // Load configuration
    const executor = new CommandExecutor(OMNIFLOW_HOME, projectKey, envName, commands, options);

    await executor.execute();
}