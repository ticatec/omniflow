# Omniflow Architecture Design

## Core Philosophy

Omniflow adopts a **unified scheduling entry + project self-managed pipeline** architecture:

- **config.yaml** - Unified scheduling entry, fetched from git, manages all CI/CD projects
- **Project Repository** - Each project's pipeline script is managed in its own code repository

## Architecture Layers

```
Environment Variables:
  OMNIFLOW_CONFIG_REPO=https://git.example.com/omniflow/config.git  # Required
  OMNIFLOW_HOME=~/.omniflow                                         # Optional
  GIT_USERNAME=xxx                                                  # Optional
  GIT_TOKEN=xxx                                                     # Optional
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                    ~/.omniflow/                                  │
│                    Working Directory                              │
├─────────────────────────────────────────────────────────────────┤
│  cache/config/            # Config repository cache               │
│    ├── config.yaml       # Unified scheduling config             │
│    └── commands.js       # Shared commands library (optional)    │
│  project/                # Workspace                              │
│    └── <project>/<env>/  # Project code checkout                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    git repository: config.git                   │
│                    Unified Scheduling Entry - Config Center     │
├─────────────────────────────────────────────────────────────────┤
│  omniflow:                                                     │
│    env: { Global Variables }                                   │
│    git: { Global Git Configuration }                           │
│    ssh: { Server Configuration }                               │
│  projects:                                                     │
│    - [App Platform Group] folder                              │
│      vars: { Group Variables }                                 │
│      items:                                                    │
│        - [Platform Service] project                            │
│          vars: { Project Variables }                           │
│          repos: { git: xxx.git }                              │
│          environments: [test, prod]                            │
│        - [User Service] project                                │
│          repos: { git: xxx.git }                              │
│    - [Supply Chain System] folder                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Project Repository (omni-gate/platform.git)  │
├─────────────────────────────────────────────────────────────────┤
│  omniflow/deploy.js      # Deployment script (self-managed)    │
│  src/                    # Source code                          │
│  package.json            # Version number                       │
└─────────────────────────────────────────────────────────────────┘
```

## Configuration File Responsibilities

### config.yaml (in configuration repository)

**Purpose**: Unified scheduling entry, directory organization

**Contains**:
- Global environment variables (`omniflow.env`)
- Global Git configuration (`omniflow.git`)
- SSH server configuration (`omniflow.ssh`)
- Project list (directory structure)
- Group/project repository URLs, environment definitions, variables

**Location**: git repository specified by `OMNIFLOW_CONFIG_REPO` environment variable

### omniflow/deploy.js (in project repository)

**Purpose**: Actual pipeline script

**Characteristics**:
- Managed by the project itself, can be modified at any time
- Can be committed to the project repository for version control
- Can use the project's code and tools

### commands.js (in configuration repository, optional)

**Purpose**: Shared command library that all project pipelines can use

**Characteristics**:
- Centralized management of common deployment commands (SSH, Docker, etc.)
- Reduces code duplication and improves reusability
- Located at the root of the configuration repository, alongside config.yaml

**Usage**:
```javascript
// In omniflow/deploy.js
export default async function pipeline(ctx) {
  const { commands } = ctx

  // SSH remote execution
  await commands.sshExec({
    host: '192.168.1.5',
    user: 'deploy',
    command: `
      cd /opt/app
      npm install
      npm run build
    `
  })

  // Remote deployment (wrapper)
  await commands.remoteDeploy({
    host: env.DEPLOY_HOST,
    user: 'deploy',
    remotePath: '/opt/app',
    command: `
      npm install
      pm2 restart app
    `
  })

  // Docker deployment
  await commands.dockerDeploy({
    image: 'myapp:latest',
    container: 'myapp',
    host: '192.168.1.5',
    user: 'deploy'
  })

  // Utility functions
  const version = commands.utils.buildVersion('v')
}
```

**Built-in Commands**:
- `sshExec()` - SSH remote command execution
- `remoteDeploy()` - Remote deployment wrapper
- `dockerDeploy()` - Docker container deployment
- `dockerBuild()` - Docker image building
- `utils` - Utility functions (version, date formatting, etc.)

## Workspace Structure

```
~/.omniflow/
└── project/
    └── <project-key>/
        └── <environment>/
            └── <cloned-repo>/
```

Example:
```
~/.omniflow/project/my-app/platform/test/    # Test environment workspace
~/.omniflow/project/my-app/platform/prod/    # Production environment workspace
```

## Project Types

### folder (group)

For organizing projects, variables are inherited by children:

```yaml
- name: app-platform
  type: folder
  vars:                    # Optional, inherited by children
    DEPLOY_REGION: us-east-1
  items:                   # Required
    - name: user-service
```

### project (project)

Actual project with repository and environments:

```yaml
- name: user-service
  vars:                    # Optional, project variables
    REPLICAS: "3"
  repos:                   # Required
    git: https://...
  environments:            # Required
    - name: test
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

Example:

```yaml
omniflow:
  env:
    REGISTRY: docker.example.com
    NAMESPACE: company

projects:
  - name: app-platform
    type: folder
    vars:
      NAMESPACE: company/app     # Override global
    items:
      - name: user-service
        vars:
          REPLICAS: "3"          # Override folder
        environments:
          - name: test
            vars:
              REPLICAS: "1"      # Override project
```

## Branch Merge Flow

When `merge_from` and `merge_strategy` are configured:

1. Create PR/MR (source → target)
2. Immediately auto-merge

Example configuration:
```yaml
environments:
  - name: prod
    branch: main
    merge_from: dev
    merge_strategy: github    # github, gitlab, forgejo
    merge_method: merge       # merge, squash, rebase
```

## Usage Flow

```bash
# 1. Set configuration repository address
export OMNIFLOW_CONFIG_REPO=https://git.example.com/omniflow/config.git

# 2. Edit config.yaml in configuration repository to add projects

# 3. Create omniflow/deploy.js in project repository

# 4. Execute deployment
omniflow run app-platform/user-service test

# 5. List projects
omniflow list projects

# 6. List environments
omniflow list environments app-platform/user-service

# 7. List available commands
omniflow list commands app-platform/user-service test

# 8. Update local configuration cache
omniflow reload
```

## Script Context

Objects available in deployment scripts:

```javascript
export default async function pipeline(ctx) {
  // Workspace info
  ctx.workspace      // Workspace path (~/.omniflow/project/...)
  ctx.projectRoot    // Project root directory (same as workspace)

  // Shared commands (from commands.js in config repository)
  ctx.commands       // { sshExec, remoteDeploy, dockerDeploy, utils }

  // Environment variables
  ctx.env            // Merged environment variables

  // Project info
  ctx.project.key    // 'app-platform/user-service'
  ctx.project.name   // 'User Service'
  ctx.project.description

  // Environment info
  ctx.environment.name        // 'test'
  ctx.environment.config      // Environment config object

  // Git info
  ctx.git.url         // Repository URL
  ctx.git.branch      // Current branch
  ctx.git.commit      // Commit hash

  // Command info (if command specified)
  ctx.command.name         // 'frontend-deploy'
  ctx.command.description

  // Omniflow config
  ctx.omniflow       // config.omniflow global configuration

  // Other
  ctx.verbose        // Verbose mode flag
}
```

## Configuration Cache

On first run, fetch config from git and cache, subsequent runs use cache:

```bash
omniflow run app-platform/user-service test  # Use cached config
omniflow reload                               # Update cache from git
```

## Local Code Update Strategy

Each time deployment is executed:

1. If workspace exists: `git fetch && git reset --hard origin/<branch>`
2. If workspace doesn't exist: `git clone --depth 1 --single-branch`
3. Clean untracked files: `git clean -fd`

This ensures local code is always consistent with remote.