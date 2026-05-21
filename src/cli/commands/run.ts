// Omniflow run command

import path from 'path'
import { $ } from 'zx'
import { OmniflowConfigLoader, settingsManager } from '../../config/index.js'
import { executeGitWorkflow } from '../../core/git.js'
import { createUtils } from '../utils/index.js'
import type { CommandDefinition } from '../../types/config.js'

interface RunOptions {
  dryRun: boolean
  verbose: boolean
}

export async function runCommand(
  projectKey: string,
  envName: string,
  commands: string[],
  options: RunOptions
): Promise<void> {
  const loader = new OmniflowConfigLoader()

  // Get OMNIFLOW_HOME from settings or environment
  const OMNIFLOW_HOME = await settingsManager.getOmniflowHome()

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
    console.log(`\n📋 Available commands for ${projectKey}:\n`)
    if (!project.commands || project.commands.length === 0) {
      console.log(`  No commands defined`)
    } else {
      for (const cmd of project.commands) {
        console.log(`  ${cmd.name}${cmd.description ? ' - ' + cmd.description : ''}`)
      }
    }
    console.log(`\nUsage: omniflow run -e ${envName} ${projectKey} <command> [command...]`)
    process.exit(0)
  }

  // Validate all commands exist before running
  const commandDefs: CommandDefinition[] = []
  for (const cmdName of commands) {
    const def = project.commands?.find((c: any) => c.name === cmdName)
    if (!def) {
      console.error(`❌ Command not found: ${cmdName}`)
      if (project.commands && project.commands.length > 0) {
        console.log(`\nAvailable commands:`)
        for (const cmd of project.commands) {
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

  // Workspace path: $OMNIFLOW_HOME/project/<project-path>/
  // All environments share the same workspace, just different branches
  const workspacePath = path.join(OMNIFLOW_HOME, 'project', ...projectKey.split('/'))
  const projectRoot = workspacePath

  console.log(`\n🚀 Running: ${project.name || projectKey}`)
  console.log(`   Project: ${projectKey}`)
  console.log(`   Environment: ${envName}`)
  console.log(`   Commands: ${commands.join(', ')}`)
  console.log(`   Branch: ${gitConfig.branch}`)
  if (gitConfig.merge_from) {
    console.log(`   (Remote merge: ${gitConfig.merge_from} → ${gitConfig.branch})`)
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

    // Debug: log what loadCommands returned
    console.log(`\n📜 Debug: loadCommands returned:`, sharedCommands)
    console.log(`  Keys: ${sharedCommands ? Object.keys(sharedCommands).join(', ') : 'null'}`)

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
        // Command-level args (highest priority)
        ...(commandDef.args || {}),
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
          // Script path resolution:
          // 1. Use script field if provided
          // 2. Use name if it starts with './'
          // 3. Default to ./modules/<command-name>
          const scriptPath = commandDef.script
            ? commandDef.script
            : commandDef.name.startsWith('./')
              ? commandDef.name
              : `./modules/${commandDef.name}`

          const resolvedScriptPath = path.resolve(projectRoot, scriptPath)

          // Import and run the script
          const scriptModule = await import(resolvedScriptPath)

          if (typeof scriptModule.default === 'function') {
            // Build actions object - for executing operations
            const actions = {
              log: {
                info: (msg: string) => console.log(`  ℹ️  ${msg}`),
                success: (msg: string) => console.log(`  ✅ ${msg}`),
                error: (msg: string) => console.error(`  ❌ ${msg}`),
                warn: (msg: string) => console.log(`  ⚠️  ${msg}`)
              },
              shell: {
                exec: async (cmd: string) => {
                  const result = await $`${cmd}`
                  return { stdout: result.stdout, stderr: result.stderr }
                }
              },
              git: {
                clone: async (opts: { url: string; branch: string; path: string }) => {
                  await $`git clone --depth 1 --branch ${opts.branch} ${opts.url} ${opts.path}`
                }
              }
            }

            // Create utils object from utils module
            const utils = createUtils()

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
                description: commandDef.description,
                args: commandDef.args || {}
              },
              git: {
                url: gitConfig.url,
                branch: gitResult.branch,
                commit: gitResult.commit || ''
              },
              env: scriptEnv,
              // Add system alias for backward compatibility
              system: {
                WORKSPACE: workspacePath,
                WORKPLACE: projectRoot,
                PROJECT_NAME: project.name || projectKey,
                PACKAGE_VERSION: gitResult.commit?.substring(0, 8) || 'unknown'
              },
              omniflow: config.omniflow,
              commands: sharedCommands,
              actions: actions,
              utils: utils,
              verbose: options.verbose
            }

            // Debug: log sharedCommands
            if (options.verbose) {
              console.log(`\n📜 sharedCommands:`, JSON.stringify(sharedCommands, null, 2))
            } else {
              console.log(`\n📜 sharedCommands keys: ${sharedCommands ? Object.keys(sharedCommands).join(', ') : 'null'}`)
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