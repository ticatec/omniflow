/**
 * Git Command Operations
 * Encapsulates local git command-line operations
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'

const execAsync = promisify(exec)

/**
 * Git status result
 */
export interface GitStatusResult {
    exists: boolean
    branch?: string
    commit?: string
}

/**
 * Check if a directory is a git repository
 */
async function isGitRepo(targetDir: string): Promise<boolean> {
    try {
        await execAsync('git rev-parse --git-dir', { cwd: targetDir })
        return true
    } catch {
        return false
    }
}

/**
 * Get current git status (branch and commit)
 */
export async function getGitStatus(targetDir: string): Promise<GitStatusResult> {
    try {
        const exists = await isGitRepo(targetDir)
        if (!exists) {
            return { exists: false }
        }

        const [branchResult, commitResult] = await Promise.all([
            execAsync('git rev-parse --abbrev-ref HEAD', { cwd: targetDir }),
            execAsync('git rev-parse HEAD', { cwd: targetDir })
        ])

        return {
            exists: true,
            branch: branchResult.stdout.trim(),
            commit: commitResult.stdout.trim()
        }
    } catch (error) {
        return { exists: false }
    }
}

/**
 * Clone a git repository
 */
async function cloneRepo(url: string, targetDir: string, branch?: string): Promise<void> {
    let cloneCmd = `git clone --depth 1`
    if (branch) {
        cloneCmd += ` --branch ${branch} --single-branch`
    }

    await execAsync(`${cloneCmd} ${url} ${targetDir}`, {
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    })
}

/**
 * Fetch from remote
 */
async function fetch(targetDir: string, branch: string): Promise<void> {
    await execAsync(`git fetch origin ${branch}:${branch}`, {
        cwd: targetDir,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    })
}

/**
 * Reset to remote branch
 */
async function resetHard(targetDir: string, branch?: string): Promise<void> {
    const ref = branch ? `origin/${branch}` : 'origin/HEAD'
    await execAsync(`git reset --hard ${ref}`, { cwd: targetDir })
}

/**
 * Clean untracked files and directories
 */
async function clean(targetDir: string): Promise<void> {
    await execAsync('git clean -fd', { cwd: targetDir })
}

/**
 * Update or clone repository
 * - If repo exists: fetch and reset
 * - If repo doesn't exist: clone
 *
 * @param url - Repository URL
 * @param targetDir - Target directory
 * @param branch - Optional branch name
 * @returns Git status result
 */
export async function updateOrClone(
    url: string,
    targetDir: string,
    branch?: string
): Promise<GitStatusResult> {
    const exists = await isGitRepo(targetDir)

    if (exists) {
        // Set authenticated URL
        await execAsync(`git remote set-url origin ${url}`, { cwd: targetDir })

        // Fetch and reset
        if (branch) {
            await fetch(targetDir, branch)
        } else {
            await fetch(targetDir, 'HEAD')
        }
        await resetHard(targetDir, branch)
        await clean(targetDir)
    } else {
        // Clone repository
        await cloneRepo(url, targetDir, branch)
    }

    return getGitStatus(targetDir)
}

export default {
    getGitStatus,
    updateOrClone
}