// Git workflow operations

import { exec } from 'child_process'
import { promisify } from 'util'
import { strategyRegistry } from './strategies/index.js'

const execAsync = promisify(exec)

/**
 * Check if two branches have differences via API
 * Returns true if branches are different, false if source is already included in target
 */
async function checkBranchesHaveChanges(
  repoUrl: string,
  sourceBranch: string,
  targetBranch: string,
  targetDir: string
): Promise<boolean> {
  try {
    console.log(`  🔍 Debug: checking if branches have differences via API...`)

    const repoInfo = parseGitUrl(repoUrl)
    if (!repoInfo) {
      console.log(`  ⚠️  Could not parse repo URL, assuming changes exist`)
      return true
    }

    const token = extractTokenFromUrl(repoUrl)
    if (!token) {
      console.log(`  ⚠️  Could not extract token, assuming changes exist`)
      return true
    }

    const protocol = repoUrl.startsWith('https://') ? 'https://' : 'http://'
    const serverUrl = `${protocol}${repoInfo.platform}`

    // Use Forgejo compare API to check differences
    // Format: /api/v1/repos/{owner}/{repo}/compare/{base}...{head}
    // base = target branch, head = source branch
    const compareUrl = `${serverUrl}/api/v1/repos/${repoInfo.owner}/${repoInfo.repo}/compare/${targetBranch}...${sourceBranch}`

    console.log(`  🔍 Debug: compare URL = ${compareUrl.replace(token, '***')}`)

    const compareResp = await fetch(compareUrl, {
      headers: { 'Authorization': `token ${token}` }
    })

    if (!compareResp.ok) {
      console.log(`  ⚠️  Could not get compare result from API (status ${compareResp.status}), assuming changes exist`)
      return true
    }

    const compareResult = await compareResp.json() as any

    // Check comparison result
    // - ahead: target分支领先source分支的提交数
    // - behind: target分支落后source分支的提交数
    // - diff_files: 差异文件数量
    const ahead = compareResult.ahead || 0
    const behind = compareResult.behind || 0
    const diffFiles = compareResult.diff_files || []
    const commits = compareResult.commits || []

    console.log(`  🔍 Debug: ahead = ${ahead}, behind = ${behind}, diff_files = ${diffFiles.length}, commits = ${commits.length}`)

    // If there are no diff files and no commits from source, source is already included in target
    if (diffFiles.length === 0 && commits.length === 0) {
      console.log(`  🔍 Debug: source branch '${sourceBranch}' is already included in target '${targetBranch}'`)
      return false
    }

    console.log(`  🔍 Debug: branches have differences (${diffFiles.length} files changed, ${commits.length} commits)`)
    return true

  } catch (error) {
    // If check fails, assume there are changes and proceed
    console.log(`  ⚠️  Could not check branch differences, assuming changes exist: ${(error as Error).message}`)
    return true
  }
}

/**
 * Extract token from authenticated URL
 */
function extractTokenFromUrl(url: string): string | null {
  try {
    const match = url.match(/:\/\/([^@]+)@/)
    if (match) {
      const credentials = match[1]
      // Format is token@ or username:password@
      if (!credentials.includes(':')) {
        return credentials // token only
      }
      // If username:password, use password as token
      const parts = credentials.split(':')
      return parts[1] || parts[0]
    }
  } catch {}
  return null
}

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

    // Debug: show git URL with credentials masked
    const maskedUrl = url.replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@')
    console.log(`  🔍 Debug: git URL = ${maskedUrl}`)

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

      // Set up authentication by updating the remote URL with token
      // The URL already has token embedded from buildAuthenticatedUrl
      console.log(`  🔍 Debug: setting remote URL with token`)
      await execAsync(`git remote set-url origin ${url}`, { cwd: targetDir })

      // Now fetch with the authenticated URL
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

      // Optional: restore original URL without token for security
      // await execAsync(`git remote set-url origin ${config.url}`, { cwd: targetDir })
    } else {
      // Local doesn't exist, clone
      console.log(`  📥 Cloning repository`)
      let cloneCmd = `git clone --depth 1 --single-branch`
      if (branch) {
        cloneCmd += ` --branch ${branch}`
      }
      // Clone to target directory directly (without creating repo-name subdirectory)
      // We do this by creating the directory first and cloning into it with '.'
      cloneCmd += ` ${url} ${targetDir}/.omniflow-tmp-clone`

      await execAsync(cloneCmd, {
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })

      // Move contents from temp subdirectory to target directory
      const fs = await import('fs/promises')
      const path = await import('path')
      const tmpDir = path.join(targetDir, '.omniflow-tmp-clone')
      const files = await fs.readdir(tmpDir, { withFileTypes: true })

      for (const file of files) {
        await fs.rename(
          path.join(tmpDir, file.name),
          path.join(targetDir, file.name)
        )
      }

      // Remove temp directory
      await fs.rm(tmpDir, { recursive: true, force: true })
    }

    // 1. If merge_from is specified, submit merge request via API
    // Do this AFTER git clone/fetch so we can check for branch differences
    if (config.merge_from) {
      console.log(`  📨 Submitting merge request: ${config.merge_from} → ${branch}`)

      // Check if branches are different before creating PR
      const hasChanges = await checkBranchesHaveChanges(
        url,
        config.merge_from,
        branch,
        targetDir
      )

      if (!hasChanges) {
        console.log(`  ℹ️  Branch ${config.merge_from} is already included in ${branch}, skipping PR`)
      } else {
        await createMergeRequest(
          url,
        config.merge_from,
        branch,
        config.username,
        config.password,
        config.strategy
        )
        console.log(`  ✓ Merge request submitted`)

        // After PR is merged, fetch the latest changes
        console.log(`  📥 Fetching merged changes...`)
        await execAsync(`git fetch origin ${branch}`, {
          cwd: targetDir,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        })
        await execAsync(`git reset --hard origin/${branch}`, {
          cwd: targetDir
        })
        console.log(`  ✓ Local repository updated to latest`)
      }
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
  // Debug: log original URL
  console.log(`  🔍 Debug: repoUrl = ${repoUrl}`)

  const repoInfo = parseGitUrl(repoUrl)

  if (!repoInfo) {
    console.log(`  ℹ️  Cannot parse repository URL, skipping API request`)
    return
  }

  // Debug: log parsed info
  console.log(`  🔍 Debug: parsed platform = ${repoInfo.platform}`)
  console.log(`  🔍 Debug: parsed owner = ${repoInfo.owner}`)
  console.log(`  🔍 Debug: parsed repo = ${repoInfo.repo}`)

  const token = password || username || process.env.GIT_TOKEN

  if (!token) {
    console.log(`  ℹ️  No token configured, skipping API request`)
    return
  }

  // Debug: log token (masked)
  console.log(`  🔍 Debug: token = ${token.substring(0, 8)}...${token.substring(Math.max(0, token.length - 4))}`)

  // Add serverUrl and token to repoInfo
  // Use http:// or https:// based on original URL
  const protocol = repoUrl.startsWith('https://') ? 'https://' : 'http://'
  repoInfo.serverUrl = `${protocol}${repoInfo.platform}`
  repoInfo.token = token

  // Debug: log serverUrl
  console.log(`  🔍 Debug: serverUrl = ${repoInfo.serverUrl}`)

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

  console.log(`  🔍 Debug: strategy = ${strategyName || 'inferred'}`)

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
 * Build authenticated URL for git operations
 * For token-based auth, token should be the username
 */
function buildAuthenticatedUrl(
  url: string,
  username?: string,
  password?: string
): string {
  if (!password) return url

  try {
    const urlObj = new URL(url)
    // For token-based authentication, use token as username
    // Git format: http://token@server/repo.git (not http://user:token@server/repo.git)
    urlObj.username = password
    urlObj.password = ''
    return urlObj.toString()
  } catch {
    return url
  }
}