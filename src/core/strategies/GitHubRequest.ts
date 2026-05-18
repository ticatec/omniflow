/**
 * GitHub pull request strategy
 * Handles PR creation and merge for GitHub.com and GitHub Enterprise
 */

import  BaseMergeRequest  from './BaseMergeRequest.js'

/**
 * Strategy for creating and merging GitHub pull requests
 */
export default class GitHubRequest extends BaseMergeRequest {
  readonly platform = 'github'
  protected readonly idPrefix = '#'

  /**
   * Build GitHub API URL for the repository
   */
  protected buildApiUrl(repoInfo: any): string {
    const apiBase = repoInfo.serverUrl?.replace('github.com', 'api.github.com') || 'https://api.github.com'
    return `${apiBase}/repos/${repoInfo.owner}/${repoInfo.repo}/pulls`
  }

  /**
   * Check if a PR already exists on GitHub
   */
  protected async checkExists(
    repoInfo: any,
    source: string,
    target: string
  ): Promise<{ exists: boolean; id?: string | number }> {
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
        return { exists: true, id: prs[0].number }
      }
    }
    return { exists: false }
  }

  /**
   * Create a new GitHub PR
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
    repoInfo: any,
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