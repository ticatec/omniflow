/**
 * GitLab merge request strategy
 * Handles MR creation and merge for GitLab.com and self-hosted GitLab instances
 */

import BaseMergeRequest from './BaseMergeRequest.js'
import type {RepoInfo} from './types.js'

/**
 * Strategy for creating and merging GitLab merge requests
 */
export default class GitLabRequest extends BaseMergeRequest {
    readonly platform = 'gitlab'
    protected readonly idPrefix = '!'

    /**
     * Build GitLab API URL for the repository
     */
    protected buildApiUrl(repoInfo: RepoInfo): string {
        const apiBase = `${repoInfo.serverUrl}${repoInfo.contextPath || ''}/api/v4`
        return `${apiBase}/projects/${encodeURIComponent(`${repoInfo.owner}/${repoInfo.repo}`)}/merge_requests`
    }

    /**
     * Check if branches have differences using GitLab compare API
     */
    async checkBranchesHaveChanges(repoInfo: RepoInfo, source: string, target: string): Promise<{hasChanges: boolean; ahead?: number; behind?: number; diffFiles?: number; commits?: number}> {
        try {
            const apiBase = `${repoInfo.serverUrl}${repoInfo.contextPath || ''}/api/v4`
            const projectId = encodeURIComponent(`${repoInfo.owner}/${repoInfo.repo}`)
            const compareUrl = `${apiBase}/projects/${projectId}/repository/compare?from=${target}&to=${source}`
            console.log(`  🔍 Compare URL: ${compareUrl.replace(repoInfo.token, '***')}`)

            const response = await fetch(compareUrl, {
                headers: { 'PRIVATE-TOKEN': repoInfo.token }
            })

            if (!response.ok) {
                console.log(`  ⚠️  API check failed (status ${response.status})`)
                return { hasChanges: true }
            }

            const result = await response.json() as any
            const diffs = result.diffs || []
            const commits = result.commits || []

            console.log(`  🔍 Comparison: ${diffs.length} files, ${commits.length} commits`)

            if (diffs.length === 0 && commits.length === 0) {
                return { hasChanges: false, diffFiles: 0, commits: 0 }
            }

            return {
                hasChanges: true,
                diffFiles: diffs.length,
                commits: commits.length
            }
        } catch (error) {
            console.log(`  ⚠️  Check failed: ${(error as Error).message}`)
            return { hasChanges: true }
        }
    }

    /**
     * Check if a MR already exists on GitLab
     * @param repoInfo - Repository information
     * @param source - Source branch name
     * @param target - Target branch name
     * @returns Object indicating if MR exists, with optional MR ID and info
     */
    protected async checkExists(
        repoInfo: RepoInfo,
        source: string,
        target: string
    ): Promise<{ exists: boolean; id?: string | number; prInfo?: any }> {
        const apiUrl = this.buildApiUrl(repoInfo)
        const response = await fetch(
            `${apiUrl}?source_branch=${source}&target_branch=${target}&state=opened`,
            {
                headers: {'PRIVATE-TOKEN': repoInfo.token}
            }
        )

        if (response.ok) {
            const mrs = await response.json() as any[]
            if (mrs.length > 0) {
                return {exists: true, id: mrs[0].iid, prInfo: mrs[0]}
            }
        }
        return {exists: false}
    }

    /**
     * Create a new GitLab MR
     * @param repoInfo - Repository information
     * @param source - Source branch name
     * @param target - Target branch name
     * @returns Object containing the MR ID (iid)
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
                'PRIVATE-TOKEN': repoInfo.token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                source_branch: source,
                target_branch: target,
                title: `Merge ${source} into ${target}`
            })
        })

        if (!response.ok) {
            throw new Error(response.statusText)
        }

        const mr = await response.json() as any
        return {id: mr.iid}
    }

    /**
     * Merge a GitLab MR
     * @param repoInfo - Repository information
     * @param id - MR ID (iid)
     * @param _method - Merge method (unused for GitLab)
     */
    protected async acceptMergeRequest(
        repoInfo: RepoInfo,
        id: string | number,
        _method: string = 'merge'
    ): Promise<void> {
        const apiUrl = this.buildApiUrl(repoInfo)
        const response = await fetch(`${apiUrl}/${id}/merge`, {
            method: 'PUT',
            headers: {
                'PRIVATE-TOKEN': repoInfo.token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                merge_when_pipeline_succeeds: false,
                should_remove_source_branch: true
            })
        })

        if (!response.ok) {
            throw new Error(response.statusText)
        }
    }
}