/**
 * Omniflow Shell Utilities
 * Provides unified shell execution with proper environment configuration
 */

import {$} from 'zx';

/**
 * Set zx to use the current process environment
 * This ensures PATH and other environment variables are inherited correctly
 */
$.env = {...process.env};

/**
 * Execute a shell command with proper environment
 */
export async function exec(cmd: string): Promise<void> {
    await $`${cmd}`;
}

/**
 * Execute shell command and get output
 */
export async function execQuiet(cmd: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    const result = await $`${cmd}`.quiet();
    return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
    };
}

// Export zx's $ for direct use if needed
export {$};