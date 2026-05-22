/**
 * Merge request strategy types
 */

/**
 * Repository info extracted from Git URL
 */
export interface RepoInfo {
    /** Platform hostname (e.g., github.com, gitlab.com) */
    platform: string
    /** Repository owner/organization */
    owner: string
    /** Repository name */
    repo: string
    /** Full server URL with protocol (e.g., https://github.com) */
    serverUrl: string
    /** Authentication token */
    token: string
}

/**
 * Branch comparison result
 */
export interface BranchDiffResult {
    /** Whether branches have differences */
    hasChanges: boolean
    /** Number of commits ahead (target ahead of source) */
    ahead?: number
    /** Number of commits behind (target behind source) */
    behind?: number
    /** Number of changed files */
    diffFiles?: number
    /** Number of different commits */
    commits?: number
}

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
   * Parse repository URL to extract repo info
   * @param url - Git repository URL (http/https format only)
   * @returns Repository info or null if parsing fails
   */
  parseUrl(url: string): RepoInfo | null

  /**
   * Check if two branches have differences
   * @param repoInfo - Repository info
   * @param source - Source branch name
   * @param target - Target branch name
   * @returns Comparison result
   */
  checkBranchesHaveChanges(repoInfo: RepoInfo, source: string, target: string): Promise<BranchDiffResult>

  /**
   * Create a merge request and auto-merge it
   * @param repoInfo - Repository info
   * @param source - Source branch name
   * @param target - Target branch name
   * @param mergeMethod - Merge method: 'merge', 'squash', or 'rebase'
   */
  create(repoInfo: RepoInfo, source: string, target: string, mergeMethod?: string): Promise<void>
}