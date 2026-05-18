/**
 * Forgejo/Gitea pull request strategy
 * Handles PR creation and merge for Forgejo and Gitea instances
 */

import BaseMergeRequest from './BaseMergeRequest.js'

/**
 * Strategy for creating and merging Forgejo/Gitea pull requests
 * Compatible with Gitea API v1
 */
export default class ForgejoRequest extends BaseMergeRequest {
    readonly platform = 'forgejo'
    protected readonly idPrefix = '#'

    /**
     * Build Forgejo/Gitea API URL for the repository
     */
    protected buildApiUrl(repoInfo: any): string {
        return `${repoInfo.serverUrl}/api/v1/repos/${repoInfo.owner}/${repoInfo.repo}/pulls`
    }

    /**
     * Check if a PR already exists on Forgejo/Gitea
     */
    protected async checkExists(
        repoInfo: any,
        source: string,
        target: string
    ): Promise<{ exists: boolean; id?: string | number }> {
        const apiUrl = this.buildApiUrl(repoInfo)
        const response = await fetch(
            `${apiUrl}?state=open&head=${source}&base=${target}`,
            {
                headers: {
                    'Authorization': `token ${repoInfo.token}`,
                    'Accept': 'application/json'
                }
            }
        )

        if (response.ok) {
            const result = await response.json() as any
            if (result.length > 0 && result[0]?.number) {
                return {exists: true, id: result[0].number}
            }
        }
        return {exists: false}
    }

    /**
     * Create a new Forgejo/Gitea PR
     */
    protected async createRequest(
        repoInfo: any,
        source: string,
        target: string
    ): Promise<{ id: string | number }> {
        const apiUrl = this.buildApiUrl(repoInfo)
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `token ${repoInfo.token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: `Merge ${source} into ${target}`,
                head: source,
                base: target
            })
        })

        if (!response.ok) {
            throw new Error(response.statusText)
        }

        const pr = await response.json() as any
        return {id: pr.number}
    }

    /**
     * Merge a Forgejo/Gitea PR
     */
    protected async acceptMergeRequest(
        repoInfo: any,
        id: string | number,
        method: string = 'merge'
    ): Promise<void> {
        const apiUrl = this.buildApiUrl(repoInfo)
        const response = await fetch(`${apiUrl}/${id}/merge`, {
            method: 'POST',
            headers: {
                'Authorization': `token ${repoInfo.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                Do: 'merge'
            })
        })

        if (!response.ok) {
            throw new Error(response.statusText)
        }
    }
}