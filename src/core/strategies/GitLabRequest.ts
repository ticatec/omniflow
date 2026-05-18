/**
 * GitLab merge request strategy
 * Handles MR creation and merge for GitLab.com and self-hosted GitLab instances
 */

import BaseMergeRequest from './BaseMergeRequest.js'

/**
 * Strategy for creating and merging GitLab merge requests
 */
export default class GitLabRequest extends BaseMergeRequest {
    readonly platform = 'gitlab'
    protected readonly idPrefix = '!'

    /**
     * Build GitLab API URL for the repository
     */
    protected buildApiUrl(repoInfo: any): string {
        const apiBase = `${repoInfo.serverUrl}/api/v4`
        return `${apiBase}/projects/${encodeURIComponent(`${repoInfo.owner}/${repoInfo.repo}`)}/merge_requests`
    }

    protected async checkExists(
        repoInfo: any,
        source: string,
        target: string
    ): Promise<{ exists: boolean; id?: string | number }> {
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
                return {exists: true, id: mrs[0].iid}
            }
        }
        return {exists: false}
    }

    protected async createRequest(
        repoInfo: any,
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

    protected async acceptMergeRequest(
        repoInfo: any,
        id: string | number,
        method: string = 'merge'
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