/**
 * Base class for merge request strategies
 * Implements template method pattern to eliminate code duplication
 */

import type {MergeRequestStrategy, RepoInfo, BranchDiffResult} from './types.js'

/**
 * Abstract base class for merge request strategies
 */
export default abstract class BaseMergeRequest implements MergeRequestStrategy {

    abstract readonly platform: string
    protected abstract readonly idPrefix: string  // '#' for PR, '!' for MR

    /**
     * Parse repository URL to extract repo info
     * Default implementation handles standard http/https Git URLs
     * @param url - Git repository URL
     * @param contextPath - Optional context path for sub-path deployment (e.g., '/git')
     */
    parseUrl(url: string, contextPath?: string): RepoInfo | null {
        try {
            // Only http/https URLs are supported
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                console.log(`  ⚠️  Only http/https URLs are supported, got: ${url}`)
                return null
            }

            const urlObj = new URL(url)
            const pathParts = urlObj.pathname.split('/').filter(p => p)

            if (pathParts.length < 2) {
                console.log(`  ⚠️  Invalid URL structure, expected /owner/repo.git`)
                return null
            }

            const repo = pathParts[pathParts.length - 1].replace(/\.git$/, '')
            const owner = pathParts[pathParts.length - 2]
            const platform = urlObj.hostname
            const serverUrl = `${urlObj.protocol}//${platform}`

            // Normalize context path (ensure it starts with / and doesn't end with /)
            const normalizedContextPath = contextPath
                ? contextPath.startsWith('/') ? contextPath : `/${contextPath}`
                : ''
            const finalContextPath = normalizedContextPath.endsWith('/') && normalizedContextPath.length > 1
                ? normalizedContextPath.slice(0, -1)
                : normalizedContextPath

            return { platform, owner, repo, serverUrl, contextPath: finalContextPath, token: '' }
        } catch (error) {
            console.log(`  ⚠️  Failed to parse URL: ${(error as Error).message}`)
            return null
        }
    }

    /**
     * Check if two branches have differences via API
     * Default implementation using Forgejo/Gitea API
     */
    async checkBranchesHaveChanges(repoInfo: RepoInfo, source: string, target: string): Promise<BranchDiffResult> {
        try {
            const compareUrl = `${repoInfo.serverUrl}/api/v1/repos/${repoInfo.owner}/${repoInfo.repo}/compare/${target}...${source}`

            const response = await fetch(compareUrl, {
                headers: { 'Authorization': `token ${repoInfo.token}` }
            })

            if (!response.ok) {
                console.log(`  ⚠️  API check failed (status ${response.status}), assuming changes exist`)
                return { hasChanges: true }
            }

            const result = await response.json() as any
            const diffFiles = result.diff_files || []
            const commits = result.commits || []

            console.log(`  🔍 Comparison: ${diffFiles.length} files, ${commits.length} commits`)

            if (diffFiles.length === 0 && commits.length === 0) {
                return { hasChanges: false, diffFiles: 0, commits: 0 }
            }

            return {
                hasChanges: true,
                ahead: result.ahead || 0,
                behind: result.behind || 0,
                diffFiles: diffFiles.length,
                commits: commits.length
            }
        } catch (error) {
            console.log(`  ⚠️  Check failed: ${(error as Error).message}`)
            return { hasChanges: true }
        }
    }

    /**
     * Check if a pull/merge request already exists
     */
    protected abstract checkExists(
        repoInfo: RepoInfo,
        source: string,
        target: string
    ): Promise<{ exists: boolean; id?: string | number; prInfo?: any }>

    /**
     * Create a new pull/merge request
     */
    protected abstract createRequest(
        repoInfo: RepoInfo,
        source: string,
        target: string
    ): Promise<{ id: string | number }>

    /**
     * Accept and merge a PR/MR
     */
    protected abstract acceptMergeRequest(
        repoInfo: RepoInfo,
        id: string | number,
        method?: string
    ): Promise<void>

    /**
     * Format success message when PR/MR is created
     */
    protected formatSuccessMessage(id: string | number): string {
        return `  ✓ PR/MR created: ${this.idPrefix}${id}`
    }

    /**
     * Format message when PR/MR already exists
     */
    protected formatExistsMessage(id: string | number): string {
        return `  ℹ️  PR/MR already exists: ${this.idPrefix}${id}`
    }

    /**
     * Format message when PR/MR is merged
     */
    protected formatMergedMessage(id: string | number): string {
        return `  ✓ PR/MR merged: ${this.idPrefix}${id}`
    }

    /**
     * Create a merge request and auto-merge it (template method)
     */
    async create(
        repoInfo: RepoInfo,
        source: string,
        target: string,
        mergeMethod?: string
    ): Promise<void> {
        try {
            let mrId: string | number
            let isPrNewlyCreated = false

            // Check if already exists
            const checkResult = await this.checkExists(repoInfo, source, target)
            if (checkResult.exists && checkResult.id) {
                mrId = checkResult.id
                console.log(this.formatExistsMessage(mrId))

                // Check if already merged
                if (checkResult.prInfo?.merged) {
                    console.log(`  ℹ️  PR/MR already merged, skipping`)
                    return
                }
            } else {
                // Create new
                const result = await this.createRequest(repoInfo, source, target)
                mrId = result.id
                console.log(this.formatSuccessMessage(mrId))
                isPrNewlyCreated = true
            }

            // If PR was just created, wait a bit before attempting merge
            if (isPrNewlyCreated) {
                console.log(`  ⏳ Waiting 3 seconds for PR to be processed...`)
                await this.sleep(3000)
            }

            // Try to merge with retries
            let merged = false
            const maxRetries = 3
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`  🔍 Debug: merge attempt ${attempt}/${maxRetries}`)
                    await this.acceptMergeRequest(repoInfo, mrId, mergeMethod)
                    console.log(this.formatMergedMessage(mrId))
                    merged = true
                    break
                } catch (error) {
                    const err = error as Error
                    console.log(`  ⚠️  Merge attempt ${attempt} failed: ${err.message}`)

                    if (attempt < maxRetries) {
                        const waitTime = attempt * 2000
                        console.log(`  ⏳ Waiting ${waitTime / 1000}s before retry...`)
                        await this.sleep(waitTime)
                    } else {
                        throw error
                    }
                }
            }

            if (!merged) {
                console.log(`  ⚠️  Could not auto-merge PR/MR ${mrId} after ${maxRetries} attempts`)
            }
        } catch (error) {
            const err = error as Error
            console.log(`  ⚠️  API error: ${err.message}`)
            if (err.stack) {
                console.log(`  🔍 Debug: error stack = ${err.stack.split('\n').slice(0, 3).join('\n')}`)
            }
        }
    }

    /**
     * Sleep helper
     */
    protected sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}