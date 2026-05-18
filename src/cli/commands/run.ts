// Omniflow run command

import path from 'path'
import os from 'os'
import { $ } from 'zx'
import { OmniflowConfigLoader } from '../../config/index.js'
import { executeGitWorkflow } from '../../core/git.js'

interface RunOptions {
  dryRun: boolean
  verbose: boolean
}

// Omniflow 工作目录
const OMNIFLOW_HOME = process.env.OMNIFLOW_HOME || path.join(os.homedir(), '.omniflow')

export async function runCommand(
  projectKey: string,
  envName: string,
  commands: string[],
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

  // If no commands specified, show available commands
  if (commands.length === 0) {
    console.log(`\n📋 Available commands for ${projectKey}/${envName}:\n`)
    if (!envConfig.commands || envConfig.commands.length === 0) {
      console.log(`  No commands defined`)
    } else {
      for (const cmd of envConfig.commands) {
        console.log(`  ${cmd.name}${cmd.description ? ' - ' + cmd.description : ''}`)
      }
    }
    console.log(`\nUsage: omniflow run -e ${envName} ${projectKey} <command> [command...]`)
    process.exit(0)
  }

  // Validate all commands exist before running
  const commandDefs: Array<{ name: string; description?: string }> = []
  for (const cmdName of commands) {
    const def = envConfig.commands?.find(c => c.name === cmdName)
    if (!def) {
      console.error(`❌ Command not found: ${cmdName}`)
      if (envConfig.commands && envConfig.commands.length > 0) {
        console.log(`\nAvailable commands:`)
        for (const cmd of envConfig.commands) {
          console.log(`  - ${cmd.name}${cmd.description ? ' - ' + cmd.description : ''}`)
        }
      }
      process.exit(1)
    }
    commandDefs.push(def)
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
  console.log(`   Commands: ${commands.join(', ')}`)
  console.log(`   Branch: ${gitConfig.branch}`)
  if (envConfig.merge_from) {
    console.log(`   (Remote merge: ${envConfig.merge_from} → ${gitConfig.branch})`)
  }
  console.log(`   Workspace: ${workspacePath}`)
  console.log('')

  let overallSuccess = true
  const results: Array<{ command: string; success: boolean; error?: string }> = []

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
        strategy: gitConfig.strategy,
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

    // Load shared commands from config repository
    const sharedCommands = await loader.loadCommands() || {}

    // Execute commands sequentially
    for (let i = 0; i < commands.length; i++) {
      const commandName = commands[i]
      const commandDef = commandDefs[i]

      console.log(`\n${'─'.repeat(50)}`)
      console.log(`📋 [${i + 1}/${commands.length}] Running: ${commandName}${commandDef.description ? ' - ' + commandDef.description : ''}`)
      console.log(`${'─'.repeat(50)}`)

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
        COMMAND_INDEX: String(i),
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

      let commandSuccess = false
      let commandError = ''

      try {
        if (options.dryRun) {
          console.log(`[DRY RUN] Would execute command: ${commandName}`)
          commandSuccess = true
        } else {
          // Execute the command script
          // Command script path: ./modules/<command-name> or <custom-path>
          const scriptPath = commandDef.name.startsWith('./')
            ? commandDef.name
            : `./modules/${commandDef.name}`

          const resolvedScriptPath = path.resolve(process.cwd(), scriptPath)

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
              commands: sharedCommands,
              verbose: options.verbose
            }

            await scriptModule.default(context)
            commandSuccess = true
          } else {
            throw new Error(`Script must export a default function: ${resolvedScriptPath}`)
          }
        }
      } catch (error) {
        commandError = error instanceof Error ? error.message : String(error)
        console.error(`\n❌ Error: ${commandError}`)
        if (options.verbose && error instanceof Error) {
          console.error(error.stack)
        }
        commandSuccess = false
      }

      results.push({ command: commandName, success: commandSuccess, error: commandError })

      if (commandSuccess) {
        console.log(`\n✅ [${i + 1}/${commands.length}] ${commandName} completed`)
      } else {
        console.log(`\n❌ [${i + 1}/${commands.length}] ${commandName} failed`)
        overallSuccess = false
        // Stop on first failure
        break
      }
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`\n❌ Error: ${errorMsg}`)
    if (options.verbose && error instanceof Error) {
      console.error(error.stack)
    }
    overallSuccess = false
  }

  // Summary
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`📊 Summary:`)
  for (const result of results) {
    const icon = result.success ? '✅' : '❌'
    console.log(`   ${icon} ${result.command}`)
    if (result.error) {
      console.log(`      Error: ${result.error}`)
    }
  }
  console.log(`${'═'.repeat(50)}`)

  if (overallSuccess) {
    console.log(`\n✅ All commands completed successfully`)
  } else {
    console.log(`\n❌ Some commands failed`)
  }

  process.exit(overallSuccess ? 0 : 1)
}