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
        const url = `${repoInfo.serverUrl}/api/v1/repos/${repoInfo.owner}/${repoInfo.repo}/pulls`
        console.log(`  🔍 Debug: API URL = ${url}`)
        return url
    }

    /**
     * Check if a PR already exists on Forgejo/Gitea
     */
    protected async checkExists(
        repoInfo: any,
        source: string,
        target: string
    ): Promise<{ exists: boolean; id?: string | number; prInfo?: any }> {
        const apiUrl = this.buildApiUrl(repoInfo)
        const checkUrl = `${apiUrl}?state=open&head=${source}&base=${target}`
        console.log(`  🔍 Debug: checkExists URL = ${checkUrl}`)

        const response = await fetch(
            checkUrl,
            {
                headers: {
                    'Authorization': `token ${repoInfo.token}`,
                    'Accept': 'application/json'
                }
            }
        )

        console.log(`  🔍 Debug: checkExists response status = ${response.status}`)

        if (response.ok) {
            const result = await response.json() as any
            if (result.length > 0 && result[0]?.number) {
                const pr = result[0]
                console.log(`  🔍 Debug: existing PR mergeable = ${pr.mergeable}, merged = ${pr.merged}`)
                return {exists: true, id: pr.number, prInfo: pr}
            }
        } else {
            const errorText = await response.text()
            console.log(`  🔍 Debug: checkExists error response = ${errorText}`)
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
        console.log(`  🔍 Debug: createRequest URL = ${apiUrl}`)

        const body = {
            title: `Merge ${source} into ${target}`,
            head: source,
            base: target
        }
        console.log(`  🔍 Debug: createRequest body = ${JSON.stringify(body)}`)

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `token ${repoInfo.token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        })

        console.log(`  🔍 Debug: createRequest response status = ${response.status}`)

        if (!response.ok) {
            const errorText = await response.text()
            console.log(`  🔍 Debug: createRequest error response = ${errorText}`)
            throw new Error(`${response.status}: ${errorText}`)
        }

        const pr = await response.json() as any
        console.log(`  🔍 Debug: created PR number = ${pr.number}`)
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
        const mergeUrl = `${apiUrl}/${id}/merge`
        console.log(`  🔍 Debug: merge URL = ${mergeUrl}`)

        // First, check PR status to see if it's mergeable
        console.log(`  🔍 Debug: checking PR ${id} status before merge...`)
        const prUrl = `${apiUrl}/${id}`
        const prResponse = await fetch(prUrl, {
            headers: {
                'Authorization': `token ${repoInfo.token}`,
                'Accept': 'application/json'
            }
        })

        if (prResponse.ok) {
            const pr = await prResponse.json() as any
            console.log(`  🔍 Debug: PR mergeable = ${pr.mergeable}, merged = ${pr.merged}`)
            if (pr.merged) {
                console.log(`  ℹ️  PR already merged`)
                return
            }
            if (pr.mergeable === false) {
                throw new Error(`PR ${id} is not mergeable (conflicts or other issues)`)
            }
        }

        // Try different body formats based on Gitea/Forgejo API versions
        const bodyFormats = [
            { do: method },           // Gitea style
            { Do: method },           // Gitea style (capital D)
            { merge_method: method }, // GitHub style
            {}                        // Empty body (use default)
        ]

        const httpMethods = ['POST', 'PUT']

        let lastError: any = null

        for (const httpMethod of httpMethods) {
            for (const body of bodyFormats) {
                try {
                    console.log(`  🔍 Debug: trying ${httpMethod} with body = ${JSON.stringify(body)}`)

                    const response = await fetch(mergeUrl, {
                        method: httpMethod,
                        headers: {
                            'Authorization': `token ${repoInfo.token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(body)
                    })

                    console.log(`  🔍 Debug: merge response status = ${response.status}`)

                    if (response.ok) {
                        console.log(`  🔍 Debug: merge successful!`)
                        return
                    }

                    const errorText = await response.text()
                    console.log(`  🔍 Debug: merge error = ${errorText}`)

                    // Save error for later
                    lastError = { status: response.status, text: errorText }

                    // If it's a 405, try next format
                    if (response.status === 405 || response.status === 422) {
                        continue
                    }

                    // For other errors, break and try next HTTP method
                    break

                } catch (err) {
                    console.log(`  🔍 Debug: fetch error = ${(err as Error).message}`)
                    lastError = err
                }
            }
        }

        if (lastError) {
            throw new Error(`Failed to merge PR ${id}: ${JSON.stringify(lastError)}`)
        }
    }
}