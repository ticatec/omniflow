# Omniflow - CI/CD Pipeline Manager

[![npm version](https://badge.fury.io/js/%40ticatec%2Fomniflow.svg)](https://www.npmjs.com/package/@ticatec/omniflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[中文文档](./README_CN.md)

A unified CI/CD project scheduling and management tool with **unified scheduling entry + project self-managed pipeline** architecture.

## Core Design

```
OMNIFLOW_CONFIG_REPO (env var) → Configuration repository URL
        ↓
Fetch config.yaml from git on each run → Unified scheduling entry, defines all projects and environments
        ↓
Project repo/omniflow/deploy.js → Deployment script, managed by project itself
```

## Features

- **Unified Scheduling Entry** - Manage all CI/CD projects in one config file
- **Configuration from Git** - Fetch config.yaml and commands.js from git repository
- **Project Self-managed Pipeline** - Deployment scripts in project repos with version control
- **JavaScript Scripts** - Write pipelines in code, flexible and powerful
- **Folder Nesting** - Support project grouping with arbitrary nesting
- **Environment Separation** - Multi-environment configuration support
- **Branch Merge Flow** - Define merge strategies between environments
- **Simple Actions** - git, shell, log three core operations
- **Command List** - Define available deployment commands in config

## Installation

```bash
npm install -g @ticatec/omniflow
```

Or for local development:

```bash
npm install
npm run build
npm link
```

## Quick Start

### 1. Set Environment Variables

**Required environment variable**:

```bash
# Configuration repository address (required)
export OMNIFLOW_CONFIG_REPO=https://git.example.com/omniflow/config.git
```

**Optional environment variables**:

```bash
# Omniflow working directory (default: ~/.omniflow)
export OMNIFLOW_HOME=/opt/omniflow

# Configuration repository branch (default: main)
export OMNIFLOW_CONFIG_BRANCH=main

# Git authentication (if repository requires auth)
export GIT_USERNAME=your-username
export GIT_PASSWORD=your-token

# Git authentication token
export GIT_TOKEN=your-token
```

**Add to config file**:

```bash
# Method 1: Add to ~/.zshrc or ~/.bashrc
cat >> ~/.zshrc << 'EOF'
# Omniflow configuration
export OMNIFLOW_CONFIG_REPO=https://git.example.com/omniflow/config.git
export GIT_USERNAME=your-username
export GIT_TOKEN=your-token
EOF

# Method 2: Use .env file
mkdir -p ~/.omniflow
cat > ~/.omniflow/.env << EOF
OMNIFLOW_CONFIG_REPO=https://git.example.com/omniflow/config.git
GIT_USERNAME=your-username
GIT_TOKEN=your-token
EOF
```

The configuration repository should contain a `config.yaml` file.

### 2. Workspace Directory Structure

Omniflow uses `OMNIFLOW_HOME` as the working directory (defaults to `~/.omniflow`):

```
~/.omniflow/
├── config/
│   ├── config.yaml      # Unified scheduling config (from git)
│   └── commands.js      # Shared commands library (from git, optional)
└── project/             # Projects workspace
    └── <project-key>/   # Project path matches config.yaml structure
        └── <environment>/  # Environment-isolated workspace
            └── <cloned-repo>/  # Cloned from project git repository
```

Example:
```
~/.omniflow/
├── config/
│   ├── config.yaml      # Fetched from OMNIFLOW_CONFIG_REPO
│   └── commands.js      # Fetched from OMNIFLOW_CONFIG_REPO
└── project/
    ├── my-app/platform/
    │   ├── test/        # Test environment workspace
    │   └── prod/        # Production environment workspace
    └── my-app/micro-services/
        └── user/
            └── auth/
                ├── test/
                └── prod/
```

**Project path mapping rules:**
- The `projects` structure in config.yaml directly maps to the `project/` directory
- Each environment has an isolated workspace directory
- `folder` type items create directories
- `project` type items clone code from their git repository to the corresponding path

### 3. Create Shared Commands Library (Optional)

Create `commands.js` in the configuration repository to define common commands that can be used by all projects:

```javascript
/**
 * Omniflow Shared Commands Library
 * Location: Configuration repository root (same level as config.yaml)
 */

import { $ } from 'zx'

/**
 * SSH Remote Command Execution
 */
export async function sshExec({ host, user, command, env = {}, port = 22 }) {
  const envStr = Object.entries(env)
    .map(([k, v]) => `export ${k}="${v}"`)
    .join(' ')

  const fullCommand = envStr ? `${envStr}; ${command}` : command
  const sshCmd = `ssh -o StrictHostKeyChecking=no -p ${port} ${user}@${host} "${fullCommand.replace(/"/g, '\\"')}"`

  try {
    const result = await $`sh -c ${sshCmd}`
    return { success: true, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    return { success: false, stdout: error.stdout || '', stderr: error.stderr || '', error: error.message }
  }
}

/**
 * Remote Deployment
 */
export async function remoteDeploy({ host, user, remotePath, commands, env = {} }) {
  const cmdStr = Array.isArray(commands) ? commands.join(' && ') : commands
  const fullCommand = `cd ${remotePath} && ${cmdStr}`
  return await sshExec({ host, user, command: fullCommand.trim(), env })
}

/**
 * Utility Functions
 */
export const utils = {
  formatDate: (date = new Date()) => date.toISOString(),
  buildVersion: (prefix = 'v') => `${prefix}${Date.now()}`,
  uuid: () => Math.random().toString(36).substring(2, 15),
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))
}

// Default export - includes all commands
export default {
  sshExec,
  remoteDeploy,
  utils
}
```

**Loading Mechanism:**
- commands.js is loaded centrally by the CLI (`OmniflowConfigLoader.loadCommands()`)
- Passed to sub-command scripts as `ctx.commands`
- Supports both named and default exports

**Usage:**
```javascript
// Use in project deployment scripts
export default async function pipeline(ctx) {
  await ctx.commands.sshExec({ host: '192.168.1.5', user: 'deploy', command: 'npm run build' })
  await ctx.commands.remoteDeploy({ host: 'test.server', user: 'deploy', remotePath: '/opt/app', commands: ['pm2 restart app'] })

  const version = ctx.commands.utils.buildVersion()
}
```

### 4. Create Configuration Repository

The configuration repository should contain:

```
config.git/
├── config.yaml       # Required: Unified scheduling config
└── commands.js       # Optional: Shared commands library
```

### 5. Edit Configuration File

Edit `config.yaml` in the configuration repository to add projects:

```yaml
omniflow:
  # Global environment variables - passed to all projects
  env:
    REGISTRY: docker.aliyun.com
    NAMESPACE: company
    DEPLOY_USER: deploy

  # Global Git configuration
  git:
    repos: https://git.example.com
    username: ${GIT_USERNAME}
    password: ${GIT_PASSWORD}

  # SSH server configuration (for deployment)
  ssh:
    test:
      server: test.example.com
      user: deploy
      private_key_file: ~/.ssh/id_rsa
      port: 22
    prod:
      server: prod.example.com
      user: deploy
      private_key_file: ~/.ssh/id_rsa
      port: 22

# Project directory organization - supports nested folders
projects:
  # Group: Application Platform
  - name: my-app
    description: My Application Platform
    type: folder
    vars:                    # Group variables, inherited by child projects
      DEPLOY_REGION: us-east-1
    items:
      # Project: Platform Service
      - name: platform
        description: Platform Service
        repos:                # Required for projects
          git: ${GIT_REPOS}/my-app/platform.git
          # merge_strategy: github   # Optional (uses GIT_MERGE_STRATEGY env var if not set)
        vars:                 # Project variables (override group)
          APP_NAME: platform
          IMAGE_PREFIX: company/platform
          DEPLOY_HOST: platform.example.com
        environments:          # Required for projects
          - name: test
            description: Test Environment
            branch: main-test
            merge_from: dev-main
            vars:              # Environment variables (override project)
              DEPLOY_HOST: test.platform.example.com
            commands:
              - name: frontend-deploy
                description: Deploy frontend application
              - name: backend-build
                description: Build docker image
          - name: prod
            description: Production Environment
            branch: main
            merge_from: main-test
            commands:
              - name: frontend-deploy
              - name: backend-build

      # Project: User Service
      - name: user-service
        description: User Service
        vars:
          REPLICAS: "3"
        repos:
          git: ${GIT_REPOS}/my-app/user-service.git
        environments:
          - name: test
            branch: main-test
          - name: prod
            branch: main
```

### 6. Create Deployment Script

Create `omniflow/deploy.js` in the project repository:

```javascript
export default async function pipeline(ctx) {
  const { git, shell, log } = ctx.actions
  const { env, project, environment } = ctx

  await log.info(`Deploying ${project.name} to ${environment.name}`)

  await shell.script({
    script: `
      cd ${ctx.env.WORKSPACE}
      npm install
      npm run build
      # ... deployment steps
    `
  })

  await log.success('Deployment complete!')
}
```

### 7. Execute Deployment

```bash
# Deploy platform service to test environment
omniflow run -e test my-app/platform frontend-deploy

# Run multiple commands in one environment
omniflow run -e test my-app/platform frontend-deploy backend-build

# Deploy micro-service to production
omniflow run -e prod my-app/micro-services deploy
```

## CLI Commands

```bash
# Run deployment (using cached config)
omniflow run -e <environment> <project-path> <command> [command...]
# project-path supports nested paths, e.g.: my-app/platform
# Multiple commands can be specified, executed sequentially

# List all projects
omniflow list projects

# List project environments
omniflow list environments <project-path>

# List available commands for environment
omniflow list commands <project-path> <environment>

# Show project details
omniflow show <project-path> [environment]

# Clean workspace
omniflow clean [project-path]

# Reload configuration (fetch latest config from git and update config/)
omniflow reload
```

## Script Context

Objects available in deployment scripts:

```javascript
export default async function pipeline(ctx) {
  // Workspace Info
  ctx.workspace       // Workspace path
  ctx.projectRoot     // Project root directory

  // Project Info
  ctx.project.key        // 'my-app/platform'
  ctx.project.name       // 'Platform Service'
  ctx.project.description // Project description

  // Environment Info
  ctx.environment.name      // 'test'
  ctx.environment.config    // Environment configuration object

  // Command Info
  ctx.command.name         // 'frontend-deploy'
  ctx.command.description  // 'Deploy frontend application'

  // Git Info
  ctx.git.url      // Project git repository URL
  ctx.git.branch   // Current branch
  ctx.git.commit   // Current commit hash

  // Environment Variables
  ctx.env          // Merged environment variables (global -> folder -> project -> environment)

  // Omniflow Configuration
  ctx.omniflow     // omniflow section from config.yaml

  // Shared Commands Library
  ctx.commands     // Commands object exported from commands.js
  ctx.commands.sshExec({ ... })
  ctx.commands.utils.formatDate()

  // Options
  ctx.verbose      // Whether verbose output is enabled
}
```

## Variable Priority

Variable merge order (latter overrides former):

```
omniflow.env (global)
    ↓
folder.vars (optional)
    ↓
project.vars (optional)
    ↓
environments[].vars (environment)
```

Example: `omniflow run app-platform/user-service test`

```yaml
omniflow:
  env:
    REGISTRY: docker.example.com    # Global
    NAMESPACE: company

projects:
  - name: app-platform
    type: folder
    vars:
      NAMESPACE: company/app         # Override global
      DEPLOY_REGION: us-east-1
    items:
      - name: user-service
        vars:
          DEPLOY_REGION: us-west-2   # Override folder
          REPLICAS: "3"
        environments:
          - name: test
            vars:
              REPLICAS: "1"          # Override project
```

## Project Structure

```
Configuration Repository (specified by OMNIFLOW_CONFIG_REPO):
└── config.yaml              # Unified scheduling entry

Project Repository:
my-app.git/
├── omniflow/
│   └── deploy.js           # Deployment script
├── src/
└── package.json

Configuration structure example:
projects:
  - name: omni-gate          # Folder
    items:
      - name: platform       # Project
        environments: [...]
      - name: micro-services # Nested folder
        type: folder
        items:
          - name: test       # Environment
          - name: prod       # Environment
```

## Configuration Reference

### Project Types

**folder (group)** - For organizing projects, variables are inherited by children:
```yaml
- name: app-platform
  type: folder
  vars:                    # Optional, inherited by children
    NAMESPACE: company/app
  items:                   # Required, child items
    - name: user-service
```

**project (project)** - Actual project with repository and environments:
```yaml
- name: user-service
  type: project            # Optional, defaults to project
  vars:                    # Optional, project variables
    REPLICAS: "3"
  repos:                   # Required
    git: https://...
    merge_strategy: github  # MR/PR strategy: github, gitlab, forgejo (optional)
  environments:            # Required
    - name: test
```

**Note:** `merge_strategy` can also be set globally via the `GIT_MERGE_STRATEGY` environment variable. If not specified in the project config, the env var value is used.

### Environment Configuration

```yaml
environments:
  - name: test              # Environment name
    description: Test Environment
    branch: main-test       # Target branch
    merge_from: dev-main    # Source branch for merge (optional)
    vars:                   # Environment variables (optional)
      API_URL: https://test.api.com
    commands:               # Available command list (optional)
      - name: deploy
        description: Deploy application
      - name: rollback
        description: Rollback version
```

### Global Configuration

```yaml
omniflow:
  env:                      # Global environment variables
    REGISTRY: docker.aliyun.com
  git:                      # Git configuration
    repos: https://git.example.com
    username: ${GIT_USERNAME}
  ssh:                      # SSH server configuration
    test:
      server: test.example.com
      user: deploy
      private_key_file: ~/.ssh/id_rsa
```

## Workspace Structure

```
~/.omniflow/
├── config/
│   ├── config.yaml      # From OMNIFLOW_CONFIG_REPO
│   └── commands.js      # From OMNIFLOW_CONFIG_REPO (optional)
└── project/
    └── <project-key>/   # Path matches config.yaml projects structure
        └── <environment>/  # Environment-isolated workspace
            └── <cloned-repo>/
```

Example:
```
~/.omniflow/
├── config/
│   ├── config.yaml
│   └── commands.js
└── project/
    ├── my-app/platform/
    │   ├── test/        # Cloned from my-app/platform.git (test environment)
    │   └── prod/        # Cloned from my-app/platform.git (prod environment)
    ├── my-app/micro-services/
    │   └── user/
    │       └── auth/
    │           ├── test/
    │           └── prod/
    └── supply-nexus/platform/
        ├── test/
        └── prod/
```

## More Documentation

- [Architecture Design](docs/architecture.md)
- [Configuration Example](examples/config.yaml)
- [Deployment Script Example](examples/scripts/deploy.js)
- [Shared Commands Library Example](examples/commands.js)

## License

MIT