/**
 * Omniflow Shell Utilities
 * Provides unified shell execution with proper environment configuration
 */

import {$} from 'zx';
import {execa} from 'execa';

/**
 * Set zx to use the current process environment
 * This ensures PATH and other environment variables are inherited correctly
 */
$.env = {...process.env};

/**
 * Execute a shell command with proper environment
 * Supports multi-line commands using heredoc via execa
 */
export async function exec(cmd: string): Promise<void> {
    await execa('bash', ['-c', cmd], {
        env: {...process.env},
        stdio: 'inherit'
    })
}

/**
 * Execute shell command and get output
 * Supports multi-line commands using heredoc via execa
 */
export async function execQuiet(cmd: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    const result = await execa('bash', ['-c', cmd], {
        env: {...process.env}
    })
    return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode ?? null
    }
}

/**
 * Execute shell command and return output with error handling
 * Supports multi-line commands using heredoc via execa
 */
export async function execOutput(cmd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
        const result = await execa('bash', ['-c', cmd], {
            env: {...process.env}
        })
        return {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: 0
        }
    } catch (error: any) {
        return {
            stdout: error.stdout || '',
            stderr: error.stderr || error.message,
            exitCode: error.exitCode || 1
        }
    }
}

// Export zx's $ for direct use if needed
export {$};

// Export execa for advanced usage
export {execa};