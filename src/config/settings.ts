/**
 * Omniflow Settings Management
 * Handles settings.json storage and initial setup
 */

import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'
import readline from 'readline'

export interface OmniflowSettings {
  configRepo: string
  configBranch?: string
  gitUsername?: string
  gitToken?: string
  home?: string
}

/**
 * Settings manager for omniflow configuration
 */
export class SettingsManager {
  /**
   * Get settings file path (always in ~/.omniflow/ for bootstrapping)
   */
  getSettingsPath(): string {
    return path.join(os.homedir(), '.omniflow', 'settings.json')
  }

  /**
   * Load settings from settings.json
   */
  async loadSettings(): Promise<OmniflowSettings | null> {
    const settingsPath = this.getSettingsPath()
    try {
      const content = await fs.readFile(settingsPath, 'utf-8')
      return JSON.parse(content) as OmniflowSettings
    } catch {
      return null
    }
  }

  /**
   * Save settings to settings.json
   */
  async saveSettings(settings: OmniflowSettings): Promise<void> {
    const settingsPath = this.getSettingsPath()
    const defaultHome = path.join(os.homedir(), '.omniflow')

    // Ensure default directory exists (for settings.json)
    await fs.mkdir(defaultHome, { recursive: true })

    // If custom home is specified, ensure that directory exists too
    if (settings.home && settings.home !== defaultHome) {
      await fs.mkdir(settings.home, { recursive: true })
    }

    // Write settings
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2))
  }

  /**
   * Get OMNIFLOW_HOME from settings or environment
   */
  async getOmniflowHome(): Promise<string> {
    const settings = await this.loadSettings()
    return settings?.home || process.env.OMNIFLOW_HOME || path.join(os.homedir(), '.omniflow')
  }

  /**
   * Get config repo URL from settings or environment
   */
  async getConfigRepo(): Promise<string> {
    const settings = await this.loadSettings()
    return settings?.configRepo || process.env.OMNIFLOW_CONFIG_REPO || ''
  }

  /**
   * Get config branch from settings or environment
   */
  async getConfigBranch(): Promise<string> {
    const settings = await this.loadSettings()
    return settings?.configBranch || process.env.OMNIFLOW_CONFIG_BRANCH || 'main'
  }

  /**
   * Get git credentials from settings or environment
   */
  async getGitCredentials(): Promise<{ username?: string; password?: string }> {
    const settings = await this.loadSettings()
    return {
      username: settings?.gitUsername || process.env.GIT_USERNAME,
      password: settings?.gitToken || process.env.GIT_TOKEN || process.env.GIT_PASSWORD
    }
  }

  /**
   * Build authenticated URL from repo URL
   */
  buildAuthenticatedUrl(repoUrl: string, username?: string, password?: string): string {
    let url = repoUrl
    if (username && password) {
      try {
        const urlObj = new URL(repoUrl)
        urlObj.username = username
        urlObj.password = password
        url = urlObj.toString()
      } catch {
        // Invalid URL, use as-is
      }
    }
    return url
  }

  /**
   * Prompt user for initial setup
   * Returns true if setup was successful
   */
  async promptForInitialSetup(): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    const question = (prompt: string): Promise<string> => {
      return new Promise(resolve => {
        rl.question(prompt, (answer) => {
          resolve(answer.trim())
        })
      })
    }

    try {
      console.log('\n🔧 Omniflow Initial Setup')
      console.log('═'.repeat(50))

      const configRepo = await question('\n1. Configuration repository URL: ')
      if (!configRepo) {
        rl.close()
        return false
      }

      const configBranch = await question('2. Configuration branch (default: main): ') || 'main'

      console.log('\n3. Git authentication (optional, press Enter to skip):')
      const gitUsername = await question('   Git username: ')
      const gitToken = await question('   Git token/password: ')

      const homeDir = await question('4. Omniflow home directory (default: ~/.omniflow): ') || ''

      rl.close()

      // Expand ~ in home directory path
      const expandedHomeDir = homeDir.replace(/^~/, os.homedir())

      // Show summary
      console.log('\n📋 Setup Summary:')
      console.log(`   Repository: ${configRepo}`)
      console.log(`   Branch: ${configBranch}`)
      console.log(`   Auth: ${gitUsername ? 'Yes' : 'No'}`)
      console.log(`   Home: ${expandedHomeDir || path.join(os.homedir(), '.omniflow')}`)

      // Test connection by trying to clone
      const OMNIFLOW_HOME = expandedHomeDir || path.join(os.homedir(), '.omniflow')
      const configDir = path.join(OMNIFLOW_HOME, 'config')

      console.log('\n🔄 Testing connection...')

      try {
        const { execaCommand } = await import('execa')

        // Build authenticated URL
        const repoUrl = this.buildAuthenticatedUrl(configRepo, gitUsername, gitToken)

        // Check if config directory already exists
        const configExists = await fs.access(configDir).then(() => true).catch(() => false)

        if (configExists) {
          console.log(`   Config directory exists, updating...`)
          // Remove existing directory and re-clone
          await fs.rm(configDir, { recursive: true, force: true })
        }

        // Try to clone
        await execaCommand(`git clone --depth 1 --branch ${configBranch} --single-branch ${repoUrl} ${configDir}`, {
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        })

        // Verify omniflow.yaml exists
        const configPath = path.join(configDir, 'omniflow.yaml')
        await fs.access(configPath)

        console.log('✅ Connection successful!\n')

        // Save settings to settings.json (save expanded path)
        const settings: OmniflowSettings = {
          configRepo,
          configBranch,
          gitUsername: gitUsername || undefined,
          gitToken: gitToken || undefined,
          home: expandedHomeDir || undefined
        }

        await this.saveSettings(settings)
        console.log('✅ Settings saved to: ' + this.getSettingsPath())
        console.log('')

        return true

      } catch (error) {
        console.error(`❌ Connection failed: ${(error as Error).message}`)
        console.error('Please check your settings and try again.\n')
        return false
      }

    } catch (error) {
      rl.close()
      console.error(`\n❌ Setup cancelled: ${(error as Error).message}\n`)
      return false
    }
  }

  /**
   * Check if settings exist
   */
  async hasSettings(): Promise<boolean> {
    const settingsPath = this.getSettingsPath()
    return fs.access(settingsPath).then(() => true).catch(() => false)
  }
}

/**
 * Default settings manager instance
 */
export const settingsManager = new SettingsManager()