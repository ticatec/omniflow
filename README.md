# Omniflow - CI/CD Pipeline Manager

[![npm version](https://badge.fury.io/js/%40ticatec%2Fomniflow.svg)](https://www.npmjs.com/package/@ticatec/omniflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[中文文档](./README_CN.md)

A unified CI/CD project scheduling and management tool with **unified scheduling entry + project self-managed pipeline** architecture.

## Core Design

```
OMNIFLOW_CONFIG_REPO (env var) → Configuration repository URL
        ↓
Fetch omniflow.yaml from git on each run → Unified scheduling entry, defines all projects and environments
        ↓
Project repo/omniflow/deploy.js → Deployment script, managed by project itself
```

## Features

- **Unified Scheduling Entry** - Manage all CI/CD projects in one config file
- **Configuration from Git** - Fetch omniflow.yaml and commands.js from git repository
- **Project Self-managed Pipeline** - Deployment scripts in project repos with version control
- **JavaScript Scripts** - Write pipelines in code, flexible and powerful
- **Folder Nesting** - Support project grouping with arbitrary nesting
- **Environment Separation** - Multi-environment configuration support
- **Branch Merge Flow** - Define merge strategies between environments
- **Simple Actions** - git, shell core operations
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

**Note:** When using `npm run start` to run commands, use `--` to separate arguments to prevent npm from parsing `-e` as `--enjoy-by`:

```bash
npm run start -- run -e test omni-gate/platform backend:build
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

### 2. Workspace Directory Structure

Omniflow uses `OMNIFLOW_HOME` as the working directory (defaults to `~/.omniflow`):

```
~/.omniflow/
├── config/
│   ├── omniflow.yaml      # Unified scheduling config (from git)
│   └── bin/
│       └── index.js       # Shared commands library (from git, optional)
└── project/             # Projects workspace
    └── <project-key>/   # Project path matches omniflow.yaml structure
```

Example:
```
~/.omniflow/
├── config/
│   ├── omniflow.yaml      # Fetched from OMNIFLOW_CONFIG_REPO
│   └── bin/
│       └── index.js       # Fetched from OMNIFLOW_CONFIG_REPO
└── project/
    ├── my-app/platform/   # Project cloned here
    └── my-app/micro-services/user/auth/
```

**Project path mapping rules:**
- The `projects` structure in omniflow.yaml directly maps to the `project/` directory
- `folder` type items create directory structure
- `project` type items clone code from their git repository to the corresponding path
- On each run, switch to the branch corresponding to the specified environment

### 3. Create Shared Commands Library (Optional)

Create `bin/index.js` in the configuration repository to define common commands that can be used by all projects.

**File Format Requirements:**
- Location: `bin/index.js` in the config repository
- Must export a default function: `export default function loadCommands(actions, utils)`
- Function receives `actions` and `utils` provided by omniflow
- Function returns an object containing custom commands

**Complete Example:**

```javascript
/**
 * Omniflow Shared Commands Library
 * Location: Configuration repository root (same level as omniflow.yaml)
 *
 * Must export default function:
 * export default function loadCommands(actions, utils) { return {...} }
 */

/**
 * loadCommands - entry point for omniflow to load commands
 * @param {Object} actions - core operations provided by omniflow
 * @param {Object} utils - utility functions provided by omniflow
 * @returns {Object} custom commands object
 *
 * actions includes:
 *   - shell: { exec(cmd) } - shell command execution
 *   - git: { clone(opts) } - git operations
 *   - node: { install, build, execute, getPackageInfo, ... } - Node.js operations
 *   - ssh: { exec, scpFile } - SSH/SCP operations
 *   - web: { build(opts) } - Web frontend build
 *   - docker: { compose, composeOnRemote } - Docker Compose operations
 *
 * utils includes:
 *   - getPackageVersion({ workspace, subdir })
 *   - formatTemplateFile({ sourceFile, targetFile, variables })
 *   - tar({ sourceDir, filename, outputDir })
 */
export default function loadCommands(actions, utils) {
  const { ssh, node, web, docker } = actions

  /**
   * Remote deployment
   * Execute deployment commands on remote server via SSH
   */
  async function remoteDeploy({ host, user, privateKeyFile, remotePath, command, port = 22 }) {
    console.log(`🚀 Deploying to ${user}@${host}:${remotePath}`)

    // Use ssh operation provided by omniflow
    const result = await ssh.exec(
      { host, user, privateKeyFile, port },
      `cd ${remotePath} && ${command}`
    )

    if (result.exitCode !== 0) {
      throw new Error(`Deployment failed: ${result.stderr}`)
    }

    console.log(`✓ Deployment complete`)
    return result.stdout
  }

  /**
   * Build Node.js app and create tar archive
   * Uses node operation provided by omniflow
   */
  async function buildAndTar({ workspace, pm = 'pnpm', target = 'build', outputDir = './releases' }) {
    // Install dependencies
    await node.install(workspace, pm)

    // Build
    await node.build(workspace, pm)

    // Get version info
    const pkgInfo = await node.getPackageInfo(workspace)
    const filename = `${pkgInfo.name}-${pkgInfo.version}`

    // Create archive (using tar utility provided by omniflow)
    const tarPath = await utils.tar({
      sourceDir: `${workspace}/${target}`,
      filename,
      outputDir
    })

    console.log(`✓ Build complete: ${tarPath}`)
    return { tarPath, version: pkgInfo.version }
  }

  /**
   * Deploy web app to remote server
   * Full flow: local build -> package -> upload -> remote deploy
   */
  async function deployWebApp({
    workspace,
    pm = 'npm',
    sshConfig,
    remotePath,
    target = 'dist',
    subCommand = 'build'
  }) {
    // Use web build operation provided by omniflow
    const archivePath = await web.build({
      pm,
      workDir: workspace,
      target: subCommand,
      outputDir: './releases'
    })

    // Upload to remote server
    const filename = archivePath.split('/').pop()
    const remoteTarPath = `/tmp/${filename}`
    await ssh.scpFile(sshConfig, archivePath, remoteTarPath)

    // Remote extract and deploy
    await ssh.exec(
      sshConfig,
      `mkdir -p ${remotePath} && tar -xzf ${remoteTarPath} -C ${remotePath} && rm ${remoteTarPath}`
    )

    console.log(`✓ Web app deployment complete`)
  }

  /**
   * Docker Compose deployment to remote server
   */
  async function deployDockerCompose({
    workDir,
    tplFile,
    sshConfig,
    remoteDir,
    preCommands,
    composeCommands = 'up -d'
  }) {
    // Use docker compose operation provided by omniflow
    await docker.composeOnRemote(
      sshConfig,
      remoteDir,
      tplFile,
      composeCommands,
      preCommands
    )
  }

  // Return all custom commands
  return {
    remoteDeploy,
    buildAndTar,
    deployWebApp,
    deployDockerCompose
  }
}
```

**Usage in project scripts:**

```javascript
// omniflow.js
export default async function pipeline(ctx, folder, args) {
  // ctx.commands contains custom commands loaded from commands.js

  // Use custom remoteDeploy command
  await ctx.commands.remoteDeploy({
    host: '192.168.1.100',
    user: 'deploy',
    privateKeyFile: '~/.ssh/deploy_key',
    remotePath: '/opt/myapp',
    command: 'git pull && npm install && pm2 restart app'
  })

  // Use custom buildAndTar command
  const { tarPath, version } = await ctx.commands.buildAndTar({
    workspace: ctx.projectRoot,
    pm: 'pnpm'
  })

  console.log(`Build version: ${version}`)
  console.log(`Archive: ${tarPath}`)
}
```

**Available actions:**

| Action | Description | Methods |
|--------|-------------|---------|
| `shell` | Shell command execution | `exec(cmd)` |
| `git` | Git operations | `clone(opts)` |
| `node` | Node.js operations | `install`, `build`, `execute`, `getPackageInfo`, `getPackageVersion`, `getPackageName` |
| `ssh` | SSH/SCP operations | `exec(config, command, remoteDir)`, `scpFile(config, srcFile, targetFile)` |
| `web` | Web frontend build | `build(opts)` |
| `docker` | Docker Compose | `compose(workDir, tplFile, commands, preCommands)`, `composeOnRemote(...)` |

**Available utils:**

| Method | Description |
|--------|-------------|
| `getPackageVersion({ workspace, subdir })` | Get version from package.json |
| `formatTemplateFile({ sourceFile, targetFile, variables })` | Replace template variables |
| `tar({ sourceDir, filename, outputDir })` | Pack directory into tar.gz |

### 4. Create Configuration Repository

The configuration repository should contain:

```
config.git/
├── omniflow.yaml       # Required: Unified scheduling config
└── commands.js       # Optional: Shared commands library
```

### 5. Edit Configuration File

Edit `omniflow.yaml` in the configuration repository to add projects:

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
        modules:              # Module configuration
          - name: frontend
            description: Frontend Application
            folder: web
            appName: web-app
            commands:
              - name: build
                description: Build frontend
              - name: deploy
                description: Deploy frontend
                args:
                  PORT: "3000"
          - name: backend
            description: Backend Service
            folder: api
            appName: api-server
            commands:
              - name: build
                description: Build Docker image
              - name: push
                description: Push image
        environments:          # Required for projects
          - name: test
            description: Test Environment
            branch: main-test
            merge_from: dev-main
            vars:              # Environment variables (override project)
              DEPLOY_HOST: test.platform.example.com
          - name: prod
            description: Production Environment
            branch: main
            merge_from: main-test

      # Project: User Service (single module, empty folder means script in project root)
      - name: user-service
        description: User Service
        vars:
          REPLICAS: "3"
        repos:
          git: ${GIT_REPOS}/my-app/user-service.git
        modules:
          - name: main
            description: Main Service
            commands:
              - name: build
              - name: deploy
        environments:
          - name: test
            branch: main-test
          - name: prod
            branch: main
```

### 6. Create Deployment Script

**Important: Each module MUST have a `.omniflow/pipeline.js` file in its corresponding directory to execute CI/CD.**

Script file location rules:
- With `folder` config: Script at `<projectRoot>/<folder>/.omniflow/pipeline.js`
- Without `folder` config (empty): Script at `<projectRoot>/.omniflow/pipeline.js`

Create module script files in the project repository:

```javascript
// web/.omniflow/pipeline.js (in module folder directory)
export default async function pipeline(ctx, folder, args) {
  const { git, shell } = ctx.actions
  const { env } = ctx

  console.log(`Deploying to ${ctx.environment} environment`)

  // folder is the module's folder config, empty string means project root
  const workDir = folder ? `${ctx.projectRoot}/${folder}` : ctx.projectRoot

  // Execute deployment logic
  await shell.exec(`cd ${workDir} && npm install && npm run build`)

  console.log('Deployment complete!')
}
```

**Project repository structure example:**
```
my-app.git/
├── web/
│   └── .omniflow/
│       └── pipeline.js    # Frontend module script (required)
├── api/
│   └── .omniflow/
│       └── pipeline.js    # Backend module script (required)
├── src/
└── package.json
```

**Configuration mapping:**
```yaml
modules:
  - name: frontend
    folder: web           # Maps to web/.omniflow/pipeline.js
    commands:
      - name: build
      - name: deploy
  - name: backend
    folder: api           # Maps to api/.omniflow/pipeline.js
    commands:
      - name: build
      - name: deploy
```

### 7. Execute Deployment

```bash
# Execute single module command
omniflow run -e test my-app/platform backend:build

# Execute commands across multiple modules
omniflow run -e test my-app/platform backend:build frontend:deploy backend:push

# Single module project (empty folder)
omniflow run -e test my-app/user-service main:build
```

## CLI Commands

```bash
# Run deployment (using cached config)
omniflow run -e <environment> <project-path> <module:command> [module:command...]
# project-path supports nested paths, e.g.: my-app/platform
# Command format: module:command, can execute across multiple modules

# List all projects
omniflow list projects

# List project environments
omniflow list environments <project-path>

# List modules for project
omniflow list modules <project-path>

# List all modules and commands for project
omniflow list commands <project-path>

# List commands for specific module
omniflow list commands <project-path> backend

# Show project details
omniflow show <project-path> [environment]

# Clean workspace
omniflow clean [project-path]

# Update configuration (fetch latest config from git)
omniflow update
```

## Script Context

Deployment script function signature:

```javascript
/**
 * Deployment script function
 * @param {ScriptContext} context - Script context object
 * @param {string|undefined} folder - Command subdirectory (from command.folder)
 * @param {string|undefined} appName - Application name (from command.appName)
 * @param {Object} args - Command arguments (from command.args)
 */
export default async function deployScript(context, folder, appName, args) {
  // Script implementation
}
```

**ScriptContext Object Structure:**

```javascript
{
  // Workspace Info
  workspace: string,        // Workspace path (~/.omniflow/project/<project-key>)
  projectRoot: string,      // Project root directory (cloned repo root)

  // Project Info
  project: string,          // Project name
  environment: string,      // Environment name ('test' | 'prod' | ...)

  // Actions
  actions: {
    shell: { exec(cmd) },        // Shell command execution
    git: { clone(opts) },        // Git clone operations
    node: {...},                 // Node.js operations
    ssh: {...},                  // SSH/SCP operations
    web: {...},                  // Web frontend build
    docker: {...}                // Docker Compose operations
  },

  // Utils
  utils: {
    getPackageVersion,      // Get package.json version
    formatTemplateFile,        // Replace template variables
    tar                     // Pack directory
  },

  // Merged environment variables (omniflow.env + envConfig.vars)
  env: {
    // Merged global and environment variables
  },

  // Shared commands library (loaded from commands.js)
  commands: {
    // Custom commands object returned from commands.js
  },

  // Options
  verbose: boolean         // Whether verbose output is enabled
}
```

**actions Details:**

```javascript
// Shell operations
ctx.actions.shell.exec('ls -la')

// Git operations
await ctx.actions.git.clone({
  url: 'https://github.com/user/repo.git',
  targetDir: '/path/to/dest',
  branch: 'main'
})

// Node.js operations
await ctx.actions.node.install('/path/to/project', 'pnpm', ['--frozen-lockfile'])
await ctx.actions.node.build('/path/to/project', 'npm')
const info = await ctx.actions.node.getPackageInfo('/path/to/project')

// SSH operations
await ctx.actions.ssh.exec(
  { host: '192.168.1.100', user: 'deploy', privateKeyFile: '~/.ssh/key' },
  'ls -la',
  '/opt/app'  // remoteDir (optional)
)
await ctx.actions.ssh.scpFile(
  { host: '192.168.1.100', user: 'deploy', privateKeyFile: '~/.ssh/key' },
  './app.tar.gz',
  '/opt/app/app.tar.gz'
)

// Web build
const archivePath = await ctx.actions.web.build({
  pm: 'npm',
  workDir: '/path/to/project',
  target: 'build',
  outputDir: './releases'
})

// Docker Compose
await ctx.actions.docker.compose('/path/to/project', 'docker-compose.yml', 'up -d', 'mkdir -p data')
```
```

### ctx.actions - System Operations

| Method | Description |
|--------|-------------|
| `shell.exec(cmd)` | Execute shell command |
| `git.clone(opts)` | Clone git repository |

### ctx.utils - Utility Functions

| Method | Description |
|--------|-------------|
| `getPackageVersion({ workspace, subdir })` | Get version from package.json |
| `formatTemplateFile({ sourceFile, targetFile, variables })` | Format template file and write |
| `formatTemplate(content, variables)` | Format template string, return result |
| `mergeComposeEnv({ envInputs, indent })` | Merge Docker Compose environment variables |
| `tar({ sourceDir, filename, outputDir, zip })` | Create tar or tar.gz archive |

**Template Variable Syntax:**

Use `{{key}}` placeholders (distinguished from shell env vars `${var}`), supports nested object access:

```javascript
// Template file content
// FROM {{docker.io}}/{{docker.namespace}}/{{app}}:{{version}}

await ctx.utils.formatTemplateFile({
  sourceFile: './Dockerfile.tpl',
  targetFile: './Dockerfile',
  variables: {
    app: 'my-service',
    version: '1.0.0',
    docker: {
      io: 'registry.cn-zhangjiakou.aliyuncs.com',
      namespace: 'ticatec'
    }
  }
})
// Result: FROM registry.cn-zhangjiakou.aliyuncs.com/ticatec/my-service:1.0.0

// String formatting
const content = 'Hello {{name}}, version is {{app.version}}'
const result = ctx.utils.formatTemplate(content, {
  name: 'World',
  app: { version: '2.0.0' }
})
// result: 'Hello World, version is 2.0.0'
```

**Usage Example:**

```javascript
// Get package version
const version = await ctx.utils.getPackageVersion({
  workspace: ctx.projectRoot,
  subdir: 'omni_sse'  // optional subdirectory
})

// Format template file
await ctx.utils.formatTemplateFile({
  sourceFile: './docker-compose.tpl.yml',
  targetFile: './docker-compose.yml',
  variables: {
    PROJECT_NAME: 'my-app',
    DOCKER_IMAGE: `myapp:${version}`,
    PORT: '3000'
  }
})

// Create tar.gz archive
await ctx.utils.tar({
  sourceDir: './dist',
  filename: 'my-app-1.0.0',
  outputDir: './releases'
})
// Generates: ./releases/my-app-1.0.0.tar.gz
```

### ctx.environment - Environment Attributes

| Attribute | Description |
|-----------|-------------|
| `name` | Environment name (e.g., 'test', 'prod') |
| `config` | Full environment configuration object |
| `config.branch` | Target branch for this environment |
| `config.merge_from` | Source branch for merge (optional) |
| `config.vars` | Environment-specific variables |
| `config.description` | Environment description (optional) |

**Usage Example:**

```javascript
// Get environment name
const envName = ctx.environment.name  // 'test' or 'prod'

// Get environment branch
const branch = ctx.environment.config.branch  // 'main-test'

// Get merge source (if configured)
const mergeFrom = ctx.environment.config.merge_from  // 'dev-main'

// Get environment-specific variables
const envVars = ctx.environment.config.vars  // { DEPLOY_HOST: 'test.example.com' }

// Execute different logic based on environment
if (envName === 'prod') {
  console.log('🚀 Deploying to production!')
  // Production-specific logic
} else if (envName === 'test') {
  console.log('🧪 Deploying to test environment...')
  // Test-specific logic
}

// Access via environment variable (alternative)
const envName2 = ctx.env.ENVIRONMENT  // Same as ctx.environment.name
const branch2 = ctx.env.BRANCH        // Same as ctx.environment.config.branch
```

## Variable Priority

Variable merge order (latter overrides former):

```
omniflow.env (global environment variables)
    ↓
environments[].vars (environment variables)
```

**Note:** Variable merging supports deep merge. For object-type variables, only specified properties are overridden while other properties are preserved.

Example:

```yaml
omniflow:
  env:
    REGISTRY: docker.example.com    # Global
    NAMESPACE: company
    deploy_config:                  # Object type
      timeout: 300
      retries: 3

projects:
  - name: user-service
    environments:
      - name: test
        vars:
          DEPLOY_HOST: test.example.com
          deploy_config:            # Deep merge
            timeout: 60             # Only override timeout, keep retries: 3
      - name: prod
        vars:
          DEPLOY_HOST: prod.example.com
```

Final test environment `deploy_config`:
```javascript
{
  timeout: 60,    // Overridden by environment variable
  retries: 3      // Inherited from global variable
}
```

## Project Structure

```
Configuration Repository (specified by OMNIFLOW_CONFIG_REPO):
└── omniflow.yaml              # Unified scheduling entry

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
```

### Project Commands Configuration

Commands are defined at the project level, shared by all environments:

```yaml
- name: my-project
  description: My Project
  repos:
    git: ${GIT_REPOS}/my-project.git
  commands:               # Project-level command definitions
    - name: deploy
      description: Deploy application
      script: omniflow/deploy.js    # Script path (relative to project root)
    - name: build-frontend
      description: Build frontend
      folder: frontend              # Command subdirectory
      script: omniflow/build.js     # Script path (relative to folder)
      appName: web-app              # Application name (passed to script)
    - name: deploy-backend
      description: Deploy backend service
      folder: backend
      script: omniflow/deploy.js
      appName: api-server
      args:                          # Command-level arguments
        PORT: "8080"
        NODE_ENV: production
  environments:
    - name: test
      branch: main-test
    - name: prod
      branch: main
```

**Command Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Command name, used when executing |
| `description` | string | No | Command description |
| `folder` | string | No | Command subdirectory (relative to project root) |
| `script` | string | Yes | Script path (relative to project root or folder) |
| `appName` | string | No | Application name, passed to script |
| `args` | object | No | Command-level arguments, merged into context.env |

**Script Execution:**

```javascript
// Script receives: (context, folder, appName, args)
export default async function deployScript(context, folder, appName, args) {
  console.log('folder:', folder)        // from command.folder
  console.log('appName:', appName)      // from command.appName
  console.log('args:', args)            // from command.args
  console.log('env:', context.env)     // merged environment variables

  // Execute deployment logic
  // ...
}
```

**Script Path Resolution:**

1. If `folder` is specified, base directory is `<projectRoot>/<folder>`
2. `script` path is relative to base directory
3. Example: `folder: frontend`, `script: omniflow/build.js`
   - Full path: `<projectRoot>/frontend/omniflow/build.js`

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
│   ├── omniflow.yaml      # From OMNIFLOW_CONFIG_REPO
│   └── commands.js      # From OMNIFLOW_CONFIG_REPO (optional)
└── project/
    └── <project-key>/   # Path matches omniflow.yaml projects structure
        └── <environment>/  # Environment-isolated workspace
            └── <cloned-repo>/
```

Example:
```
~/.omniflow/
├── config/
│   ├── omniflow.yaml
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
- [Configuration Example](examples/omniflow.yaml)
- [Deployment Script Example](examples/scripts/deploy.js)
- [Shared Commands Library Example](examples/commands.js)

## License

MIT