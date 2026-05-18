/**
 * Base class for merge request strategies
 * Implements template method pattern to eliminate code duplication
 */

import type {MergeRequestStrategy} from './types.js'

/**
 * Abstract base class for merge request strategies
 */
export default abstract class BaseMergeRequest implements MergeRequestStrategy {

    abstract readonly platform: string
    protected abstract readonly idPrefix: string  // '#' for PR, '!' for MR

    /**
     * Check if a pull/merge request already exists
     * @param repoInfo - Repository info
     * @param source - Source branch name
     * @param target - Target branch name
     */
    protected abstract checkExists(
        repoInfo: any,
        source: string,
        target: string
    ): Promise<{ exists: boolean; id?: string | number }>

    /**
     * Create a new pull/merge request
     * @param repoInfo - Repository info
     * @param source - Source branch name
     * @param target - Target branch name
     */
    protected abstract createRequest(
        repoInfo: any,
        source: string,
        target: string
    ): Promise<{ id: string | number }>

    /**
     * Accept and merge a PR/MR
     * @param repoInfo - Repository info
     * @param id - PR/MR ID
     * @param method - Merge method: 'merge', 'squash', or 'rebase'
     */
    protected abstract acceptMergeRequest(
        repoInfo: any,
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
     * @param repoInfo - Repository info { platform, owner, repo, serverUrl, token }
     * @param source - Source branch name
     * @param target - Target branch name
     */
    async create(
        repoInfo: any,
        source: string,
        target: string
    ): Promise<void> {
        try {
            let mrId: string | number

            // Check if already exists
            const checkResult = await this.checkExists(repoInfo, source, target)
            if (checkResult.exists && checkResult.id) {
                mrId = checkResult.id
                console.log(this.formatExistsMessage(mrId))
            } else {
                // Create new
                const result = await this.createRequest(repoInfo, source, target)
                mrId = result.id
                console.log(this.formatSuccessMessage(mrId))
            }

            // Auto merge
            await this.acceptMergeRequest(repoInfo, mrId)
            console.log(this.formatMergedMessage(mrId))
        } catch (error) {
            console.log(`  ⚠️  API error: ${(error as Error).message}`)
        }
    }
}