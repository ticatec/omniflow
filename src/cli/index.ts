// Omniflow CLI - CI/CD Pipeline Manager

import { Command } from 'commander'
import { OmniflowConfigLoader } from '../config'
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
  .argument('<environment>', 'Environment name (e.g., test, prod)')
  .argument('[command]', 'Command name (optional, e.g., frontend-deploy)')
  .option('-d, --dry-run', 'Preview mode without execution')
  .option('-v, --verbose', 'Verbose output')
  .action(async (project, environment, command, options) => {
    await runCommand(project, environment, command, {
      dryRun: options.dryRun || false,
      verbose: options.verbose || false
    })
  })

// =============================================================================
// List command - List projects or environments
// =============================================================================
program
  .command('list')
  .description('List projects, environments, or commands')
  .argument('<type>', 'Type to list: projects, environments, commands')
  .argument('[project]', 'Project key (required for type: environments, commands)')
  .argument('[environment]', 'Environment name (required for type: commands)')
  .action(async (type, project, environment) => {
    const loader = new OmniflowConfigLoader()

    if (type === 'projects') {
      const projects = await loader.listProjects()

      console.log('Projects:\n')
      for (const p of projects) {
        console.log(`  ${p.key}${p.description ? ' - ' + p.description : ''}`)
      }
    } else if (type === 'environments' || type === 'branches') {
      if (!project) {
        console.error('❌ Project key is required for listing environments')
        process.exit(1)
      }

      const environments = await loader.listEnvironments(project)

      console.log(`Environments for ${project}:\n`)
      for (const envName of environments) {
        const envConfig = await loader.getEnvironment(project, envName)
        console.log(`  ${envName}${envConfig?.description ? ' - ' + envConfig.description : ''}`)
        if (envConfig) {
          console.log(`    branch: ${envConfig.branch}`)
          if (envConfig.merge_from) {
            console.log(`    merge_from: ${envConfig.merge_from}`)
          }
        }
      }
    } else if (type === 'commands') {
      if (!project || !environment) {
        console.error('❌ Project key and environment name are required for listing commands')
        process.exit(1)
      }

      const envConfig = await loader.getEnvironment(project, environment)
      if (!envConfig) {
        console.error(`❌ Environment not found: ${project}/${environment}`)
        process.exit(1)
      }

      if (!envConfig.commands || envConfig.commands.length === 0) {
        console.log(`No commands defined for ${project}/${environment}`)
        return
      }

      console.log(`Commands for ${project}/${environment}:\n`)
      for (const cmd of envConfig.commands) {
        console.log(`  ${cmd.name}${cmd.description ? ' - ' + cmd.description : ''}`)
      }
    } else {
      console.error('❌ Invalid type. Use "projects", "environments", or "commands"')
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
    const loader = new OmniflowConfigLoader()

    const projectConfig = await loader.getProject(project)
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
      const envConfig = await loader.getEnvironment(project, environment)
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
      const environments = await loader.listEnvironments(project)
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
// Reload command - Fetch latest config from git and update cache
// =============================================================================
program
  .command('reload')
  .description('Reload configuration from git (update local cache)')
  .action(async () => {
    const loader = new OmniflowConfigLoader()

    try {
      console.log('🔄 Fetching latest configuration from git...')

      // Force reload (clears cache and fetches fresh)
      await loader.reload()

      // Show summary
      const projects = await loader.listProjects()
      const tree = await loader.listProjectTree()

      console.log('✅ Configuration cache updated\n')
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
      console.error(`❌ Failed to reload config: ${(error as Error).message}`)
      process.exit(1)
    }
  })

program.parse()
