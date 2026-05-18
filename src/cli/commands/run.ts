// Omniflow run command

import path from 'path'
import os from 'os'
import { $ } from 'zx'
import { OmniflowConfigLoader } from '../../config'
import { executeGitWorkflow } from '../../core/git'

interface RunOptions {
  dryRun: boolean
  verbose: boolean
}

// Omniflow 工作目录
const OMNIFLOW_HOME = process.env.OMNIFLOW_HOME || path.join(os.homedir(), '.omniflow')

export async function runCommand(
  projectKey: string,
  envName: string,
  commandName: string | undefined,
  options: RunOptions
): Promise<void> {
  const loader = new OmniflowConfigLoader()

  // Load configuration
  const config = await loader.load()

  // Get project
  const project = await loader.getProject(projectKey)
  if (!project) {
    console.error(`❌ Project not found: ${projectKey}`)
    const available = await loader.listProjects()
    if (available.length > 0) {
      console.log(`\nAvailable projects: ${available.map(p => p.key).join(', ')}`)
    }
    process.exit(1)
  }

  // Get environment configuration
  const envConfig = await loader.getEnvironment(projectKey, envName)
  if (!envConfig) {
    console.error(`❌ Environment not found: ${envName}`)
    const available = await loader.listEnvironments(projectKey)
    if (available.length > 0) {
      console.log(`\nAvailable environments: ${available.join(', ')}`)
    }
    process.exit(1)
  }

  // If no command specified, show available commands
  if (!commandName) {
    console.log(`\n📋 Available commands for ${projectKey}/${envName}:\n`)
    if (!envConfig.commands || envConfig.commands.length === 0) {
      console.log(`  No commands defined`)
    } else {
      for (const cmd of envConfig.commands) {
        console.log(`  ${cmd.name}${cmd.description ? ' - ' + cmd.description : ''}`)
      }
    }
    console.log(`\nUsage: omniflow run ${projectKey} ${envName} <command>`)
    process.exit(0)
  }

  // Find command in environment
  const commandDef = envConfig.commands?.find(c => c.name === commandName)
  if (!commandDef) {
    console.error(`❌ Command not found: ${commandName}`)
    if (envConfig.commands && envConfig.commands.length > 0) {
      console.log(`\nAvailable commands:`)
      for (const cmd of envConfig.commands) {
        console.log(`  - ${cmd.name}${cmd.description ? ' - ' + cmd.description : ''}`)
      }
    }
    process.exit(1)
  }

  // Get git configuration
  const gitConfig = await loader.getGitConfig(projectKey, envName)
  if (!gitConfig) {
    console.error(`❌ Git configuration not found for project: ${projectKey}`)
    process.exit(1)
  }

  // Workspace path: $OMNIFLOW_HOME/project/<project-path>/<environment>/
  const workspacePath = path.join(OMNIFLOW_HOME, 'project', ...projectKey.split('/'), envName)
  const projectRoot = workspacePath

  console.log(`\n🚀 Running: ${project.name || projectKey}`)
  console.log(`   Project: ${projectKey}`)
  console.log(`   Environment: ${envName}`)
  console.log(`   Command: ${commandName}${commandDef.description ? ' - ' + commandDef.description : ''}`)
  console.log(`   Branch: ${gitConfig.branch}`)
  if (envConfig.merge_from) {
    console.log(`   (Remote merge: ${envConfig.merge_from} → ${gitConfig.branch})`)
  }
  console.log(`   Workspace: ${workspacePath}`)
  console.log('')

  let success = false

  try {
    // Create workspace directory
    await $`mkdir -p ${workspacePath}`

    // Git workflow: clone
    if (options.verbose) {
      console.log(`🔄 Cloning: ${gitConfig.url}`)
    }

    const gitResult = await executeGitWorkflow(
      {
        url: gitConfig.url,
        branch: gitConfig.branch,
        merge_from: envConfig.merge_from,
        strategy: envConfig.merge_strategy,
        username: gitConfig.username,
        password: gitConfig.password
      },
      projectRoot
    )

    if (!gitResult.success) {
      throw new Error(`Git workflow failed: ${gitResult.error}`)
    }

    if (options.verbose) {
      console.log(`✓ Git ready: ${gitResult.branch} @ ${gitResult.commit.substring(0, 8)}`)
    }

    // Get merged variables: global -> project -> environment
    const mergedVars = await loader.getMergedVars(projectKey, envName)

    // Prepare environment variables for the script
    const scriptEnv = {
      // System env
      ...process.env,
      // Merged variables (global -> project -> environment)
      ...mergedVars,
      // Workspace info
      OMNIFLOW_HOME,
      WORKSPACE: workspacePath,
      PROJECT_ROOT: projectRoot,
      PROJECT_KEY: projectKey,
      PROJECT_NAME: project.name || projectKey,
      ENVIRONMENT: envName,
      COMMAND: commandName,
      BRANCH: gitResult.branch,
      COMMIT: gitResult.commit || ''
    }

    if (options.verbose) {
      console.log(`\n📜 Environment variables:`)
      console.log(`   OMNIFLOW_HOME=${OMNIFLOW_HOME}`)
      console.log(`   WORKSPACE=${workspacePath}`)
      console.log(`   PROJECT_ROOT=${projectRoot}`)
      console.log(`   ENVIRONMENT=${envName}`)
      console.log(`   COMMAND=${commandName}`)
      console.log(`   BRANCH=${gitResult.branch}`)
      console.log('')
    }

    if (options.dryRun) {
      console.log(`[DRY RUN] Would execute command: ${commandName}`)
      success = true
    } else {
      // Execute the command script
      // Command script path: ./modules/<command-name> or <custom-path>
      const scriptPath = commandDef.name.startsWith('./')
        ? commandDef.name
        : `./modules/${commandDef.name}`

      const resolvedScriptPath = path.resolve(process.cwd(), scriptPath)

      // Load shared commands from config repository
      const commands = await loader.loadCommands() || {}

      // Import and run the script
      const scriptModule = await import(resolvedScriptPath)

      if (typeof scriptModule.default === 'function') {
        const context = {
          workspace: workspacePath,
          projectRoot: projectRoot,
          project: {
            key: projectKey,
            name: project.name || projectKey,
            description: project.description
          },
          environment: {
            name: envName,
            config: envConfig
          },
          command: {
            name: commandName,
            description: commandDef.description
          },
          git: {
            url: gitConfig.url,
            branch: gitResult.branch,
            commit: gitResult.commit || ''
          },
          env: scriptEnv,
          omniflow: config.omniflow,
          commands,
          verbose: options.verbose
        }

        await scriptModule.default(context)
        success = true
      } else {
        throw new Error(`Script must export a default function: ${resolvedScriptPath}`)
      }
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`\n❌ Error: ${errorMsg}`)
    if (options.verbose && error instanceof Error) {
      console.error(error.stack)
    }
    success = false
  }

  if (success) {
    console.log(`\n✅ Command completed successfully`)
  } else {
    console.log(`\n❌ Command failed`)
  }

  process.exit(success ? 0 : 1)
}