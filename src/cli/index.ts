#!/usr/bin/env node
// Omniflow CLI - CI/CD Pipeline Manager

import { Command } from 'commander'
import { OmniflowConfigLoader } from '../config/index.js'
import { runCommand } from './commands/run.js'

const program = new Command()

program
  .name('omniflow')
  .description('CI/CD pipeline manager for small teams')
  .version('0.1.0')

// =============================================================================
// Run command - Execute project deployment
// =============================================================================
program
  .command('run')
  .description('Run deployment for a project')
  .argument('<project>', 'Project key (e.g., omni-gate/platform)')
  .argument('<commands...>', 'Commands to run in format "module/command" (e.g., backend/build frontend/deploy)')
  .requiredOption('-e, --environment <env>', 'Environment name (e.g., test, prod)')
  .option('-d, --dry-run', 'Preview mode without execution')
  .option('-v, --verbose', 'Verbose output')
  .action(async (project, commands, options) => {
    await runCommand(project, options.environment, commands, {
      dryRun: options.dryRun || false,
      verbose: options.verbose || false
    })
  })

// =============================================================================
// List command - List projects, environments, modules, or commands
// =============================================================================
program
  .command('list')
  .description('List projects, environments, modules, or commands')
  .argument('<type>', 'Type to list: projects, environments, modules, commands')
  .argument('[project]', 'Project key (required for type: environments, modules, commands)')
  .argument('[name]', 'Module name (for filtering commands in a specific module)')
  .action(async (type, project, name) => {
    const loader = OmniflowConfigLoader.getInstance()
    await loader.load()

    if (type === 'projects') {
      const projects = loader.listProjects()

      console.log('Projects:\n')
      for (const p of projects) {
        console.log(`  ${p.key}${p.description ? ' - ' + p.description : ''}`)
      }
    } else if (type === 'environments' || type === 'branches') {
      if (!project) {
        console.error('❌ Project key is required for listing environments')
        process.exit(1)
      }

      const environments = loader.listEnvironments(project)

      console.log(`Environments for ${project}:\n`)
      for (const envName of environments) {
        const envConfig = loader.getEnvironment(project, envName)
        console.log(`  ${envName}${envConfig?.description ? ' - ' + envConfig.description : ''}`)
        if (envConfig) {
          console.log(`    branch: ${envConfig.branch}`)
          if (envConfig.merge_from) {
            console.log(`    merge_from: ${envConfig.merge_from}`)
          }
        }
      }
    } else if (type === 'modules') {
      if (!project) {
        console.error('❌ Project key is required for listing modules')
        process.exit(1)
      }

      const projectConfig = loader.getProject(project)
      if (!projectConfig) {
        console.error(`❌ Project not found: ${project}`)
        process.exit(1)
      }

      if (!projectConfig.modules || projectConfig.modules.length === 0) {
        console.log(`No modules defined for ${project}`)
        return
      }

      console.log(`Modules for ${project}:\n`)
      for (const mod of projectConfig.modules) {
        console.log(`  ${mod.name}${mod.description ? ' - ' + mod.description : ''}`)
        if (mod.folder) {
          console.log(`    folder: ${mod.folder}`)
        }
        if (mod.appName) {
          console.log(`    appName: ${mod.appName}`)
        }
        if (mod.commands && mod.commands.length > 0) {
          console.log(`    commands: ${mod.commands.map((c: any) => c.name).join(', ')}`)
        }
        console.log('')
      }
    } else if (type === 'commands') {
      if (!project) {
        console.error('❌ Project key is required for listing commands')
        process.exit(1)
      }

      const projectConfig = loader.getProject(project)
      if (!projectConfig) {
        console.error(`❌ Project not found: ${project}`)
        process.exit(1)
      }

      if (!projectConfig.modules || projectConfig.modules.length === 0) {
        console.log(`No modules defined for ${project}`)
        return
      }

      // Filter by module name if specified
      const modules = name
        ? projectConfig.modules.filter((m: any) => m.name === name)
        : projectConfig.modules

      if (modules.length === 0) {
        console.log(name
          ? `Module '${name}' not found in ${project}`
          : `No modules defined for ${project}`)
        return
      }

      console.log(`${name ? `Module '${name}'` : 'Modules and commands'} for ${project}:\n`)
      for (const mod of modules) {
        console.log(`  Module: ${mod.name}${mod.description ? ' - ' + mod.description : ''}`)
        if (mod.folder) {
          console.log(`    folder: ${mod.folder}`)
        }
        if (mod.appName) {
          console.log(`    appName: ${mod.appName}`)
        }
        if (mod.commands && mod.commands.length > 0) {
          console.log(`    commands:`)
          for (const cmd of mod.commands) {
            console.log(`      - ${cmd.name}${cmd.description ? ': ' + cmd.description : ''}`)
          }
        }
        console.log('')
      }
    } else {
      console.error('❌ Invalid type. Use "projects", "environments", "modules", or "commands"')
      process.exit(1)
    }
  })

// =============================================================================
// Show command - Show project details
// =============================================================================
program
  .command('show')
  .description('Show project or environment details')
  .argument('<project>', 'Project key')
  .argument('[environment]', 'Environment name (optional)')
  .action(async (project, environment) => {
    const loader = OmniflowConfigLoader.getInstance()
    await loader.load()

    const projectConfig = loader.getProject(project)
    if (!projectConfig) {
      console.error(`❌ Project not found: ${project}`)
      process.exit(1)
    }

    console.log(`\nProject: ${project}`)
    if (projectConfig.description) {
      console.log(`Description: ${projectConfig.description}`)
    }

    if (projectConfig.repos) {
      console.log(`\nGit:`)
      console.log(`  URL: ${projectConfig.repos.git}`)
      if (projectConfig.repos.branch) {
        console.log(`  Default Branch: ${projectConfig.repos.branch}`)
      }
    }

    if (environment) {
      const envConfig = loader.getEnvironment(project, environment)
      if (!envConfig) {
        console.error(`❌ Environment not found: ${environment}`)
        process.exit(1)
      }

      console.log(`\nEnvironment: ${environment}`)
      if (envConfig.description) {
        console.log(`Description: ${envConfig.description}`)
      }
      console.log(`  Target Branch: ${envConfig.branch}`)
      if (envConfig.merge_from) {
        console.log(`  Merge From: ${envConfig.merge_from}`)
      }
      if (envConfig.vars) {
        console.log(`  Variables:`)
        for (const [key, value] of Object.entries(envConfig.vars)) {
          console.log(`    ${key}=${value}`)
        }
      }
    } else {
      console.log(`\nEnvironments:`)
      const environments = loader.listEnvironments(project)
      for (const env of environments) {
        console.log(`  - ${env}`)
      }
    }

    console.log('')
  })

// =============================================================================
// Clean command - Clean workspace
// =============================================================================
program
  .command('clean')
  .description('Clean workspace for a project')
  .argument('[project]', 'Project key (optional, cleans all if not specified)')
  .option('-a, --all', 'Clean all workspaces')
  .action(async (project, options) => {
    const path = await import('path')
    const os = await import('os')
    const fs = await import('fs/promises')

    const OMNIFLOW_HOME = process.env.OMNIFLOW_HOME || path.join(os.homedir(), '.omniflow')

    if (options.all || !project) {
      // Clean all workspaces
      try {
        await fs.rm(OMNIFLOW_HOME, { recursive: true, force: true })
        console.log(`✅ Cleaned all workspaces: ${OMNIFLOW_HOME}`)
      } catch (error) {
        console.error(`❌ Failed to clean: ${(error as Error).message}`)
      }
    } else {
      // Clean specific project workspace
      const workspacePath = path.join(OMNIFLOW_HOME, ...project.split('/'))
      try {
        await fs.rm(workspacePath, { recursive: true, force: true })
        console.log(`✅ Cleaned workspace: ${workspacePath}`)
      } catch (error) {
        console.error(`❌ Failed to clean: ${(error as Error).message}`)
      }
    }
  })

// =============================================================================
// Update command - Fetch latest config from git and update cache
// =============================================================================
program
  .command('update')
  .description('Update configuration from git (fetch latest changes)')
  .action(async () => {
    const loader = OmniflowConfigLoader.getInstance()

    try {
      console.log('🔄 Fetching latest configuration from git...')

      // Force update (clears cache and fetches fresh)
      await loader.update()

      // Show summary
      const projects = loader.listProjects()
      const tree = loader.listProjectTree()

      console.log('✅ Configuration updated\n')
      console.log(`📊 Summary:`)
      console.log(`   Projects: ${projects.length}`)
      console.log(`   Folders: ${tree.filter(n => n.type === 'folder').length}`)

      if (projects.length > 0) {
        console.log(`\n📁 Projects:`)
        for (const p of projects) {
          console.log(`   - ${p.key}${p.description ? ' - ' + p.description : ''}`)
        }
      }
    } catch (error) {
      console.error(`❌ Failed to update config: ${(error as Error).message}`)
      process.exit(1)
    }
  })

program.parse()