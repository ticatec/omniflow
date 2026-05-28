/**
 * GitHub pull request strategy
 * Handles PR creation and merge for GitHub.com and GitHub Enterprise
 */

import BaseMergeRequest from './BaseMergeRequest.js'
import type {RepoInfo} from './types.js'

/**
 * Strategy for creating and merging GitHub pull requests
 */
export default class GitHubRequest extends BaseMergeRequest {
    readonly platform = 'github'
    protected readonly idPrefix = '#'

    /**
     * Parse GitHub URL
     * Handles both github.com and GitHub Enterprise URLs
     */
    parseUrl(url: string, contextPath?: string): RepoInfo | null {
        const result = super.parseUrl(url, contextPath)
        if (!result) return null

        // GitHub API base is different from web URL
        const apiBase = result.serverUrl.replace('github.com', 'api.github.com')
        result.serverUrl = apiBase
        return result
    }

    /**
     * Check if branches have differences using GitHub compare API
     */
    async checkBranchesHaveChanges(repoInfo: RepoInfo, source: string, target: string): Promise<{hasChanges: boolean; ahead?: number; behind?: number; diffFiles?: number; commits?: number}> {
        try {
            const compareUrl = `${repoInfo.serverUrl}/repos/${repoInfo.owner}/${repoInfo.repo}/compare/${target}...${source}`
            console.log(`  🔍 Compare URL: ${compareUrl.replace(repoInfo.token, '***')}`)

            const response = await fetch(compareUrl, {
                headers: { 'Authorization': `Bearer ${repoInfo.token}` }
            })

            if (!response.ok) {
                console.log(`  ⚠️  API check failed (status ${response.status})`)
                return { hasChanges: true }
            }

            const result = await response.json() as any
            const commits = result.commits || []
            const files = result.files || []

            console.log(`  🔍 Comparison: ${files.length} files, ${commits.length} commits`)

            if (commits.length === 0 && result.status === 'identical') {
                return { hasChanges: false, diffFiles: 0, commits: 0 }
            }

            return {
                hasChanges: true,
                ahead: result.ahead_by || 0,
                behind: result.behind_by || 0,
                diffFiles: files.length,
                commits: commits.length
            }
        } catch (error) {
            console.log(`  ⚠️  Check failed: ${(error as Error).message}`)
            return { hasChanges: true }
        }
    }

    /**
     * Build GitHub API URL for the repository
     */
    protected buildApiUrl(repoInfo: RepoInfo): string {
        return `${repoInfo.serverUrl}/repos/${repoInfo.owner}/${repoInfo.repo}/pulls`
    }

    /**
     * Check if a PR already exists on GitHub
     */
    protected async checkExists(
        repoInfo: RepoInfo,
        source: string,
        target: string
    ): Promise<{ exists: boolean; id?: string | number; prInfo?: any }> {
        const apiUrl = this.buildApiUrl(repoInfo)
        const response = await fetch(
            `${apiUrl}?head=${repoInfo.owner}:${source}&base=${target}&state=open`,
            {
                headers: {
                    'Authorization': `Bearer ${repoInfo.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        )

        if (response.ok) {
            const prs = await response.json() as any[]
            if (prs.length > 0) {
                return { exists: true, id: prs[0].number, prInfo: prs[0] }
            }
        }
        return { exists: false }
    }

    /**
     * Create a new GitHub PR
     */
    protected async createRequest(
        repoInfo: RepoInfo,
        source: string,
        target: string
    ): Promise<{ id: string | number }> {
        const apiUrl = this.buildApiUrl(repoInfo)
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${repoInfo.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: `Merge ${source} into ${target}`,
                head: `${repoInfo.owner}:${source}`,
                base: target
            })
        })

        if (!response.ok) {
            throw new Error(response.statusText)
        }

        const pr = await response.json() as any
        return { id: pr.number }
    }

    /**
     * Merge a GitHub PR
     */
    protected async acceptMergeRequest(
        repoInfo: RepoInfo,
        id: string | number,
        method: string = 'merge'
    ): Promise<void> {
        const apiUrl = this.buildApiUrl(repoInfo)
        const response = await fetch(`${apiUrl}/${id}/merge`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${repoInfo.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                commit_title: `Merge PR #${id}`,
                merge_method: method
            })
        })

        if (!response.ok) {
            throw new Error(response.statusText)
        }
    }
}