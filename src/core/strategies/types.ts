/**
 * Merge request strategy types
 */

/**
 * Strategy interface for creating merge requests/pull requests
 * Different platforms (GitHub, GitLab, etc.) implement this interface
 */
export interface MergeRequestStrategy {
  /**
   * Platform name
   */
  readonly platform: string

  /**
   * Create a merge request and auto-merge it
   * @param repoInfo - Repository info { platform, owner, repo, serverUrl, token }
   * @param source - Source branch name
   * @param target - Target branch name
   * @param mergeMethod - Merge method: 'merge', 'squash', or 'rebase'
   */
  create(repoInfo: any, source: string, target: string, mergeMethod?: string): Promise<void>
}