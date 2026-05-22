import type {VarValue} from "../../config/vars.js";

/**
 * Options for running commands
 */
export interface RunOptions {
    /** Dry run mode - show what would be executed without running */
    dryRun: boolean
    /** Verbose output - show detailed logs */
    verbose: boolean
}

/**
 * Context object passed to deployment scripts
 */
export interface ScriptContext {
    /** Workspace directory path */
    workspace: string
    /** Project root directory path */
    projectRoot: string
    /** Project information */
    project: string;
    /** Environment information */
    environment: string;
    /** Shared commands from config repository */
    commands: any
    /** Available actions (git, node, ssh, web, docker, shell, custom) */
    actions: any
    /** Utility functions (tar, templateReplace, etc.) */
    utils: any
    /** Merged environment variables (omniflow.env + envConfig.vars) */
    env: Record<string, VarValue>
    /** Verbose mode flag */
    verbose: boolean
}
