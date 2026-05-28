/**
 * Git API Operations
 * Routes to specified platform strategy
 */

import { strategyRegistry } from './strategies/index.js'
import type { RepoInfo } from './strategies/types.js'

export interface MergeOptions {
    repoUrl: string
    sourceBranch: string
    targetBranch: string
    token: string
    strategy: string  // Must be specified: 'github', 'gitlab', or 'forgejo'
    contextPath?: string  // Optional context path for sub-path deployment
}

export interface MergeResult {
    success: boolean
    merged: boolean
    message?: string
}

/**
 * Merge source branch into target branch via API
 * Strategy must be explicitly specified
 */
async function merge(options: MergeOptions): Promise<MergeResult> {
    const { repoUrl, sourceBranch, targetBranch, token, strategy } = options

    console.log(`  📨 Processing merge request: ${sourceBranch} → ${targetBranch}`)

    // Get specified strategy
    const strategyInstance = strategyRegistry.get(strategy)
    if (!strategyInstance) {
        return {
            success: false,
            merged: false,
            message: `Strategy '${strategy}' not found. Available: ${strategyRegistry.listStrategies().join(', ')}`
        }
    }

    // Parse URL to get repo info
    const repoInfo = strategyInstance.parseUrl(repoUrl, options.contextPath)
    if (!repoInfo) {
        return {
            success: false,
            merged: false,
            message: 'Failed to parse repository URL'
        }
    }

    console.log(`  🔍 Platform: ${repoInfo.platform} / Repository: ${repoInfo.owner}/${repoInfo.repo}`)
    repoInfo.token = token

    // Check if branches have differences
    const diffResult = await strategyInstance.checkBranchesHaveChanges(repoInfo, sourceBranch, targetBranch)

    if (!diffResult.hasChanges) {
        return {
            success: true,
            merged: false,
            message: `Branch '${sourceBranch}' is already included in '${targetBranch}'`
        }
    }

    // Create merge request
    try {
        await strategyInstance.create(repoInfo, sourceBranch, targetBranch)
        return {
            success: true,
            merged: true,
            message: `Successfully merged '${sourceBranch}' into '${targetBranch}'`
        }
    } catch (error) {
        return {
            success: false,
            merged: false,
            message: (error as Error).message
        }
    }
}

export default { merge }