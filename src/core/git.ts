// Git workflow operations

import { exec } from 'child_process'
import { promisify } from 'util'
import { strategyRegistry } from './strategies/index.js'

const execAsync = promisify(exec)

export interface GitConfig {
  url: string
  branch: string
  username?: string
  password?: string
  merge_from?: string
  strategy?: string  // Strategy name: 'github', 'gitlab', 'forgejo', etc.
}

export interface GitResult {
  success: boolean
  branch: string
  commit: string
  error?: string
}

/**
 * Git workflow:
 * 1. If merge_from is specified, submit merge request via API
 * 2. git pull to update local (if already exists)
 * 3. Otherwise git clone
 */
export async function executeGitWorkflow(
  config: GitConfig,
  targetDir: string
): Promise<GitResult> {
  try {
    const url = buildAuthenticatedUrl(config.url, config.username, config.password)
    const branch = config.branch

    // 1. If merge_from is specified, submit merge request via API
    if (config.merge_from) {
      console.log(`  📨 Submitting merge request: ${config.merge_from} → ${branch}`)
      await createMergeRequest(
        url,
        config.merge_from,
        branch,
        config.username,
        config.password,
        config.strategy
      )
      console.log(`  ✓ Merge request submitted`)
    }

    // 2. Check if local directory already exists
    let alreadyExists = false
    try {
      await execAsync('git rev-parse --git-dir', { cwd: targetDir })
      alreadyExists = true
    } catch {
      // Directory doesn't exist or is not a git repo
    }

    if (alreadyExists) {
      // Local exists, fetch and reset to remote (overwrite local changes)
      console.log(`  📥 Updating local: git fetch && reset`)
      await execAsync(`git fetch origin ${branch}`, {
        cwd: targetDir,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })
      await execAsync(`git reset --hard origin/${branch}`, {
        cwd: targetDir
      })
      // Clean untracked files and directories
      await execAsync('git clean -fd', {
        cwd: targetDir
      })
    } else {
      // Local doesn't exist, clone
      console.log(`  📥 Cloning repository`)
      let cloneCmd = `git clone --depth 1 --single-branch`
      if (branch) {
        cloneCmd += ` --branch ${branch}`
      }
      cloneCmd += ` ${url} ${targetDir}`

      await execAsync(cloneCmd, {
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })
    }

    // 3. Get current state
    const commit = await execAsync('git rev-parse HEAD', { cwd: targetDir })
    const currentBranch = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: targetDir })

    return {
      success: true,
      branch: currentBranch.stdout.trim(),
      commit: commit.stdout.trim()
    }
  } catch (error) {
    return {
      success: false,
      branch: '',
      commit: '',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Submit merge request via API and auto-merge it
 * @param repoUrl Repository URL
 * @param sourceBranch Source branch
 * @param targetBranch Target branch
 * @param username Git username (optional, for token)
 * @param password Git password or token
 * @param strategyName Strategy name from config (e.g., 'github', 'gitlab')
 */
async function createMergeRequest(
  repoUrl: string,
  sourceBranch: string,
  targetBranch: string,
  username?: string,
  password?: string,
  strategyName?: string
): Promise<void> {
  const repoInfo = parseGitUrl(repoUrl)

  if (!repoInfo) {
    console.log(`  ℹ️  Cannot parse repository URL, skipping API request`)
    return
  }

  const token = password || username || process.env.GIT_TOKEN

  if (!token) {
    console.log(`  ℹ️  No token configured, skipping API request`)
    return
  }

  // Add serverUrl and token to repoInfo
  repoInfo.serverUrl = `https://${repoInfo.platform}`
  repoInfo.token = token

  // Get strategy from config, or infer from platform
  let strategy = strategyName ? strategyRegistry.get(strategyName) : undefined

  // Fallback: infer strategy from platform hostname
  if (!strategy) {
    const hostname = repoInfo.platform.toLowerCase()
    if (hostname.includes('github')) {
      strategy = strategyRegistry.get('github')
    } else if (hostname.includes('gitlab')) {
      strategy = strategyRegistry.get('gitlab')
    } else if (hostname.includes('forgejo') || hostname.includes('gitea')) {
      strategy = strategyRegistry.get('forgejo')
    }
  }

  if (!strategy) {
    console.log(`  ℹ️  Strategy '${strategyName || 'undefined'}' not found. Available: ${strategyRegistry.listStrategies().join(', ')}`)
    return
  }

  try {
    await strategy.create(repoInfo, sourceBranch, targetBranch)
  } catch (error) {
    console.log(`  ⚠️  API request failed: ${(error as Error).message}`)
  }
}

/**
 * Parse Git URL to extract repository info
 */
function parseGitUrl(url: string): { platform: string; owner: string; repo: string; serverUrl?: string; token?: string } | null {
  try {
    let cleanUrl = url
    if (url.startsWith('git@')) {
      cleanUrl = url.replace(':', '/').replace('git@', 'https://')
    }

    const urlObj = new URL(cleanUrl)
    const pathParts = urlObj.pathname.split('/').filter(p => p)

    if (pathParts.length >= 2) {
      const repo = pathParts[pathParts.length - 1].replace(/\.git$/, '')
      const owner = pathParts[pathParts.length - 2]
      const platform = urlObj.hostname

      return { platform, owner, repo }
    }
  } catch {
    // Parse failed
  }

  return null
}

/**
 * Build authenticated URL
 */
function buildAuthenticatedUrl(
  url: string,
  username?: string,
  password?: string
): string {
  if (!username || !password) return url

  try {
    const urlObj = new URL(url)
    urlObj.username = username
    urlObj.password = password
    return urlObj.toString()
  } catch {
    return url
  }
}