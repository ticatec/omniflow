/**
 * Git Workflow Operations
 * Main entry point for git operations
 */

import gitCmd from './gitCmd.js'
import gitApi from './gitApi.js'

export interface GitConfig {
    url: string
    branch: string
    username?: string
    password?: string
    merge_from?: string
    strategy: string  // 'github' | 'gitlab' | 'forgejo'
}

export interface CloneOptions {
    /** Repository URL */
    url: string
    /** Target directory */
    targetDir: string
    /** Branch to clone (optional) */
    branch?: string
}

/**
 * Clone or update repository
 * Direct git command wrapper
 */
async function clone(options: CloneOptions): Promise<void> {
    const { url, targetDir, branch } = options

    console.log(`  🔍 Git URL: ${url}`)
    console.log(`  📥 Updating repository...`)

    await gitCmd.updateOrClone(url, targetDir, branch)
    console.log(`  ✓ Repository ready`)
}

/**
 * Sync repository:
 * - Clone or update to target branch
 * - Optionally merge source branch via API
 */
async function sync(config: GitConfig, targetDir: string): Promise<void> {
    // Build authenticated URL for git operations
    let url = config.url
    if (config.password) {
        const urlObj = new URL(config.url)
        urlObj.username = config.password
        urlObj.password = ''
        url = urlObj.toString()
    }

    const branch = config.branch
    const maskedUrl = url.replace(/:\/\/([^@]+)@/, '://***@')
    console.log(`  🔍 Git URL: ${maskedUrl}`)

    // 1. If merge_from specified, merge via API first
    if (config.merge_from) {
        console.log(`  🔄 Merging ${config.merge_from} → ${branch}...`)
        const mergeResult = await gitApi.merge({
            repoUrl: config.url,
            sourceBranch: config.merge_from,
            targetBranch: branch,
            token: config.password || '',
            strategy: config.strategy
        })
        if (mergeResult.merged) {
            console.log(`  ✓ Merge completed`)
        }
    }

    // 2. Clone or update repository (fetches merged code)
    console.log(`  📥 Updating repository...`)
    await gitCmd.updateOrClone(url, targetDir, branch)
    console.log(`  ✓ Repository ready`)
}

// Main export
export default { sync, clone }