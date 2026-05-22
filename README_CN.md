# Omniflow - CI/CD Pipeline Manager

[![npm version](https://badge.fury.io/js/%40ticatec%2Fomniflow.svg)](https://www.npmjs.com/package/@ticatec/omniflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](./README.md)

统一的 CI/CD 项目调度管理工具，采用**统一调度入口 + 项目自管理 pipeline**的架构。

## 核心设计

```
OMNIFLOW_CONFIG_REPO (环境变量) → 配置仓库地址
        ↓
每次运行时从 git 获取 config.yaml  → 统一调度入口，定义所有项目和环境
        ↓
项目仓库/omniflow/deploy.js → 部署脚本，项目自己管理
```

## 特性

- **统一调度入口** - 一个配置文件管理所有 CI/CD 项目
- **配置来自 Git** - 从 git 仓库获取 config.yaml 和 commands.js
- **项目自管理 pipeline** - 部署脚本在项目仓库中，可版本控制
- **JavaScript 脚本** - 用代码编写 pipeline，灵活强大
- **文件夹嵌套** - 支持项目分组，任意层次嵌套
- **环境分离** - 支持多环境配置
- **分支合并流程** - 定义环境间的分支合并策略
- **简洁 Actions** - git, shell 核心操作
- **命令列表** - 配置中定义可用的部署命令

## 安装

```bash
npm install -g @ticatec/omniflow
```

或本地开发：

```bash
npm install
npm run build
npm link
```

**注意：** 如果使用 `npm run start` 运行命令，需要使用 `--` 分隔参数，避免 npm 将 `-e` 解析为 `--enjoy-by`：

```bash
npm run start -- run -e test omni-gate/platform command-name
```

## 快速开始

### 1. 配置环境变量

**必需的环境变量**：

```bash
# 配置仓库地址（必需）
export OMNIFLOW_CONFIG_REPO=https://git.example.com/omniflow/config.git
```

**可选的环境变量**：

```bash
# Omniflow 工作目录（默认：~/.omniflow）
export OMNIFLOW_HOME=/opt/omniflow

# 配置仓库分支（默认：main）
export OMNIFLOW_CONFIG_BRANCH=main

# Git 认证（如果仓库需要认证）
export GIT_USERNAME=your-username
export GIT_PASSWORD=your-token

# Git 认证 token（统一使用 GIT_TOKEN）
export GIT_TOKEN=your-token
```

**写入配置文件**：

```bash
# 方式一：写到 ~/.zshrc 或 ~/.bashrc
cat >> ~/.zshrc << 'EOF'
# Omniflow 配置
export OMNIFLOW_CONFIG_REPO=https://git.example.com/omniflow/config.git
export GIT_USERNAME=your-username
export GIT_TOKEN=your-token
EOF

# 方式二：使用 .env 文件
mkdir -p ~/.omniflow
cat > ~/.omniflow/.env << EOF
OMNIFLOW_CONFIG_REPO=https://git.example.com/omniflow/config.git
GIT_USERNAME=your-username
GIT_TOKEN=your-token
EOF
```

### 2. 工作目录结构

Omniflow 使用 `OMNIFLOW_HOME` 作为工作目录（默认 `~/.omniflow`）：

```
~/.omniflow/
├── config/
│   ├── config.yaml      # 统一调度配置（从 git 获取）
│   └── commands.js      # 公共命令库（从 git 获取，可选）
└── project/             # 项目工作区
    └── <project-key>/   # 项目路径与 config.yaml 结构对应
        └── <environment>/  # 环境隔离的工作目录
            └── <cloned-repo>/  # 从项目 git 仓库克隆
```

示例：
```
~/.omniflow/
├── config/
│   ├── config.yaml      # 从 OMNIFLOW_CONFIG_REPO 获取
│   └── commands.js      # 从 OMNIFLOW_CONFIG_REPO 获取
└── project/
    ├── my-app/platform/
    │   ├── test/        # 测试环境工作区
    │   └── prod/        # 生产环境工作区
    └── my-app/micro-services/
        └── user/
            └── auth/
                ├── test/
                └── prod/
```

**项目路径映射规则：**
- config.yaml 中的 `projects` 结构直接映射到 `project/` 目录
- 每个环境有独立的工作目录，互不干扰
- `folder` 类型项创建目录
- `project` 类型项从其 git 地址克隆代码到对应路径

### 3. 创建配置仓库

配置仓库应包含以下文件：

```
config.git/
├── config.yaml       # 必需：统一调度配置
└── commands.js       # 可选：公共命令库
```

### 3. 创建公共命令库（可选）

在配置仓库中创建 `commands.js`，定义可被所有项目使用的公共命令。

**文件格式要求：**
- 必须导出一个默认函数 `export default function loadCommands(actions, utils)`
- 函数接收 omniflow 提供的 `actions` 和 `utils` 作为参数
- 函数返回一个包含自定义命令的对象

**完整示例：**

```javascript
/**
 * Omniflow 公共命令库
 * 位置：配置仓库根目录 (与 config.yaml 同级)
 *
 * 必须导出默认函数：
 * export default function loadCommands(actions, utils) { return {...} }
 */

/**
 * loadCommands - omniflow 加载命令的入口函数
 * @param {Object} actions - omniflow 提供的核心操作
 * @param {Object} utils - omniflow 提供的工具函数
 * @returns {Object} 自定义命令对象
 *
 * actions 包含:
 *   - shell: { exec(cmd) } - shell 命令执行
 *   - git: { clone(opts) } - git 操作
 *   - node: { install, build, execute, getPackageInfo, ... } - Node.js 操作
 *   - ssh: { exec, scpFile } - SSH/SCP 操作
 *   - web: { build(opts) } - Web 前端构建
 *   - docker: { compose, composeOnRemote } - Docker Compose 操作
 *
 * utils 包含:
 *   - getPackageVersion({ workspace, subdir })
 *   - templateReplace({ sourceFile, targetFile, variables })
 *   - tar({ sourceDir, filename, outputDir })
 */
export default function loadCommands(actions, utils) {
  const { ssh, node, web, docker } = actions

  /**
   * 远程部署应用
   * 使用 SSH 在远程服务器执行部署命令
   */
  async function remoteDeploy({ host, user, privateKeyFile, remotePath, command, port = 22 }) {
    console.log(`🚀 部署到 ${user}@${host}:${remotePath}`)

    // 使用 omniflow 提供的 ssh 操作
    const result = await ssh.exec(
      { host, user, privateKeyFile, port },
      `cd ${remotePath} && ${command}`
    )

    if (result.exitCode !== 0) {
      throw new Error(`部署失败: ${result.stderr}`)
    }

    console.log(`✓ 部署成功`)
    return result.stdout
  }

  /**
   * 构建 Node.js 应用并打包
   * 使用 omniflow 提供的 node 操作
   */
  async function buildAndTar({ workspace, pm = 'pnpm', target = 'build', outputDir = './releases' }) {
    // 安装依赖
    await node.install(workspace, pm)

    // 构建
    await node.build(workspace, pm)

    // 获取版本信息
    const pkgInfo = await node.getPackageInfo(workspace)
    const filename = `${pkgInfo.name}-${pkgInfo.version}`

    // 打包 (使用 omniflow 提供的 tar 工具)
    const tarPath = await utils.tar({
      sourceDir: `${workspace}/${target}`,
      filename,
      outputDir
    })

    console.log(`✓ 构建完成: ${tarPath}`)
    return { tarPath, version: pkgInfo.version }
  }

  /**
   * 部署 Web 应用到远程服务器
   * 完整流程：本地构建 -> 打包 -> 上传 -> 远程部署
   */
  async function deployWebApp({
    workspace,
    pm = 'npm',
    sshConfig,
    remotePath,
    target = 'dist',
    subCommand = 'build'
  }) {
    // 使用 omniflow 提供的 web 构建操作
    const archivePath = await web.build({
      pm,
      workDir: workspace,
      target: subCommand,
      outputDir: './releases'
    })

    // 上传到远程服务器
    const filename = archivePath.split('/').pop()
    const remoteTarPath = `/tmp/${filename}`
    await ssh.scpFile(sshConfig, archivePath, remoteTarPath)

    // 远程解压并部署
    await ssh.exec(
      sshConfig,
      `mkdir -p ${remotePath} && tar -xzf ${remoteTarPath} -C ${remotePath} && rm ${remoteTarPath}`
    )

    console.log(`✓ Web 应用部署完成`)
  }

  /**
   * Docker Compose 部署到远程服务器
   */
  async function deployDockerCompose({
    workDir,
    tplFile,
    sshConfig,
    remoteDir,
    preCommands,
    composeCommands = 'up -d'
  }) {
    // 使用 omniflow 提供的 docker compose 操作
    await docker.composeOnRemote(
      sshConfig,
      remoteDir,
      tplFile,
      composeCommands,
      preCommands
    )
  }

  // 返回所有自定义命令
  return {
    remoteDeploy,
    buildAndTar,
    deployWebApp,
    deployDockerCompose
  }
}
```

**在项目脚本中使用：**

```javascript
// omniflow/deploy.js
export default async function pipeline(ctx, folder, appName, args) {
  // ctx.commands 包含从 commands.js 加载的自定义命令

  // 使用自定义的 remoteDeploy 命令
  await ctx.commands.remoteDeploy({
    host: '192.168.1.100',
    user: 'deploy',
    privateKeyFile: '~/.ssh/deploy_key',
    remotePath: '/opt/myapp',
    command: 'git pull && npm install && pm2 restart app'
  })

  // 使用自定义的 buildAndTar 命令
  const { tarPath, version } = await ctx.commands.buildAndTar({
    workspace: ctx.projectRoot,
    pm: 'pnpm'
  })

  console.log(`构建版本: ${version}`)
  console.log(`归档文件: ${tarPath}`)
}
```

**可用的 actions：**

| 操作 | 说明 | 方法 |
|------|------|------|
| `shell` | Shell 命令执行 | `exec(cmd)` |
| `git` | Git 操作 | `clone(opts)` |
| `node` | Node.js 操作 | `install`, `build`, `execute`, `getPackageInfo`, `getPackageVersion`, `getPackageName` |
| `ssh` | SSH/SCP 操作 | `exec(config, command, remoteDir)`, `scpFile(config, srcFile, targetFile)` |
| `web` | Web 前端构建 | `build(opts)` |
| `docker` | Docker Compose | `compose(workDir, tplFile, commands, preCommands)`, `composeOnRemote(...)` |

**可用的 utils：**

| 方法 | 说明 |
|------|------|
| `getPackageVersion({ workspace, subdir })` | 获取 package.json 版本 |
| `templateReplace({ sourceFile, targetFile, variables })` | 替换模板变量 |
| `tar({ sourceDir, filename, outputDir })` | 打包目录为 tar.gz |

### 4. 编辑配置文件

在配置仓库中编辑 `config.yaml` 添加项目：

```yaml
omniflow:
  # 全局环境变量 - 传递给所有项目
  env:
    REGISTRY: docker.aliyun.com
    NAMESPACE: company
    DEPLOY_USER: deploy

  # 全局 Git 配置
  git:
    repos: https://git.example.com
    username: ${GIT_USERNAME}
    password: ${GIT_PASSWORD}

  # SSH 服务器配置（用于部署）
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

# 项目目录组织 - 支持嵌套文件夹
projects:
  # 分组：应用平台
  - name: my-app
    description: 我的应用平台
    type: folder
    vars:                    # 分组变量，子项目继承
      DEPLOY_REGION: us-east-1
    items:
      # 项目：平台服务
      - name: platform
        description: 平台服务
        repos:                # 项目必需
          git: ${GIT_REPOS}/my-app/platform.git
        vars:                 # 项目变量（覆盖分组）
          APP_NAME: platform
          IMAGE_PREFIX: company/platform
          DEPLOY_HOST: platform.example.com
        commands:             # 可执行的命令列表（所有环境共享）
          - name: frontend-deploy
            description: 部署前端应用
            script: ./omniflow/frontend-deploy.js
          - name: backend-build
            description: 制作docker镜像
            script: ./omniflow/backend-build.js
        environments:          # 项目必需
          - name: test
            description: 测试环境
            branch: main-test
            merge_from: dev-main
            vars:              # 环境变量（覆盖项目）
              DEPLOY_HOST: test.platform.example.com
          - name: prod
            description: 生产环境
            branch: main
            merge_from: main-test

      # 项目：用户服务
      - name: user-service
        description: 用户服务
        vars:
          REPLICAS: "3"
        repos:
          git: ${GIT_REPOS}/my-app/user-service.git
        environments:
          - name: test
            branch: main-test
          - name: prod
            branch: main

      # 项目：订单服务
      - name: order-service
        description: 订单服务
        vars:
          REPLICAS: "2"
        repos:
          git: ${GIT_REPOS}/my-app/order-service.git
        environments:
          - name: test
            branch: main-test
          - name: prod
            branch: main
                description: 部署webhooks微服务
```

### 5. 创建部署脚本

在项目仓库创建 `omniflow/deploy.js`:

```javascript
export default async function pipeline(ctx) {
  const { git, shell } = ctx.actions
  const { env, globals, secrets, system } = ctx

  console.log(`部署 ${system.PROJECT_NAME} v${system.PACKAGE_VERSION}`)

  await shell.script({
    script: `
      cd ${system.WORKPLACE}
      npm install
      npm run build
      # ... 部署步骤
    `
  })

  console.log('部署完成!')
}
```

### 6. 执行部署

```bash
# 部署平台服务的测试环境
omniflow run -e test my-app/platform frontend-deploy

# 在一个环境下同时运行多个命令
omniflow run -e test my-app/platform frontend-deploy backend-build

# 部署微服务的生产环境
omniflow run -e prod my-app/micro-services deploy
```

## CLI 命令

```bash
# 运行部署（使用缓存的配置）
omniflow run -e <environment> <project-path> <command> [command...]
# project-path 支持嵌套路径，如: my-app/platform
# 可同时运行多个命令，按顺序执行

# 列出所有项目
omniflow list projects

# 列出项目的环境
omniflow list environments <project-path>

# 列出项目的可用命令（命令定义在项目级别，所有环境共享）
omniflow list commands <project-path>

# 查看项目详情
omniflow show <project-path> [environment]

# 清理工作区
omniflow clean [project-path]

# 更新配置（从 git 获取最新配置）
omniflow update
```

## 脚本上下文

部署脚本接收的参数：

```javascript
/**
 * 部署脚本函数签名
 * @param {ScriptContext} context - 脚本上下文对象
 * @param {string|undefined} folder - 命令所在子目录（来自 command.folder）
 * @param {string|undefined} appName - 应用名称（来自 command.appName）
 * @param {Object} args - 命令参数（来自 command.args）
 */
export default async function deployScript(context, folder, appName, args) {
  // 脚本实现
}
```

**ScriptContext 对象结构：**

```javascript
{
  // 工作区信息
  workspace: string,        // 工作区路径 (~/.omniflow/project/<project-key>)
  projectRoot: string,      // 项目根目录（克隆的仓库根目录）

  // 项目信息
  project: string,          // 项目名称
  environment: string,      // 环境名称 ('test' | 'prod' | ...)

  // 操作 (actions)
  actions: {
    shell: { exec(cmd) },        // Shell 命令执行
    git: { clone(opts) },        // Git 克隆操作
    node: {...},                 // Node.js 操作
    ssh: {...},                  // SSH/SCP 操作
    web: {...},                  // Web 前端构建
    docker: {...}                // Docker Compose 操作
  },

  // 工具函数 (utils)
  utils: {
    getPackageVersion,      // 获取 package.json 版本
    templateReplace,        // 替换模板变量
    tar                     // 打包目录
  },

  // 合并的环境变量 (omniflow.env + envConfig.vars)
  env: {
    // 全局和环境变量合并后的对象
  },

  // 公共命令库 (从 commands.js 加载)
  commands: {
    // commands.js 返回的自定义命令对象
  },

  // 选项
  verbose: boolean         // 是否启用详细输出
}
```

**actions 详细说明：**

```javascript
// Shell 操作
ctx.actions.shell.exec('ls -la')

// Git 操作
await ctx.actions.git.clone({
  url: 'https://github.com/user/repo.git',
  targetDir: '/path/to/dest',
  branch: 'main'
})

// Node.js 操作
await ctx.actions.node.install('/path/to/project', 'pnpm', ['--frozen-lockfile'])
await ctx.actions.node.build('/path/to/project', 'npm')
const info = await ctx.actions.node.getPackageInfo('/path/to/project')

// SSH 操作
await ctx.actions.ssh.exec(
  { host: '192.168.1.100', user: 'deploy', privateKeyFile: '~/.ssh/key' },
  'ls -la',
  '/opt/app'  // remoteDir (可选)
)
await ctx.actions.ssh.scpFile(
  { host: '192.168.1.100', user: 'deploy', privateKeyFile: '~/.ssh/key' },
  './app.tar.gz',
  '/opt/app/app.tar.gz'
)

// Web 构建
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

### ctx.actions - 系统操作

| 方法 | 说明 |
|------|------|
| `shell.exec(cmd)` | 执行 shell 命令 |
| `git.clone(opts)` | 克隆 git 仓库 |
| `node.*` | Node.js 操作（见下文） |
| `ssh.*` | SSH/SCP 操作（见下文） |
| `web.*` | Web 前端构建（见下文） |
| `docker.*` | Docker Compose 操作（见下文） |

### ctx.actions.node - Node.js 操作

| 方法 | 说明 |
|------|------|
| `node.getPackageVersion(packageDir)` | 获取 package.json 版本 |
| `node.getPackageName(packageDir)` | 获取 package.json 名称 |
| `node.getPackageInfo(packageDir)` | 获取名称和版本 |
| `node.install(packageDir, pm, flags)` | 安装依赖 |
| `node.build(packageDir, pm, flags)` | 构建项目 |
| `node.execute(packageDir, pm, command, flags)` | 执行 npm 脚本 |

**使用示例：**

```javascript
// 获取包信息
const info = await ctx.actions.node.getPackageInfo(ctx.projectRoot)
console.log(`${info.name}@${info.version}`)

// 安装依赖
await ctx.actions.node.install(ctx.projectRoot, 'pnpm', ['--frozen-lockfile'])

// 构建
await ctx.actions.node.build(ctx.projectRoot, 'pnpm')

// 执行自定义命令
await ctx.actions.node.execute(ctx.projectRoot, 'pnpm', 'test', ['--coverage'])
```

### ctx.actions.ssh - SSH/SCP 操作

| 方法 | 说明 |
|------|------|
| `ssh.exec(sshConfig, command, remoteDir)` | 在远程服务器执行命令 |
| `ssh.scpFile(sshConfig, srcFile, targetFile)` | 复制文件到远程服务器 |

**sshConfig 结构：**

```typescript
interface SshConnectionConfig {
  host: string           // 主机地址
  user: string           // 用户名
  port?: number          // 端口，默认 22
  password?: string      // 密码（可选）
  privateKey?: string    // 私钥内容（可选）
  privateKeyFile?: string // 私钥文件路径（可选）
}
```

**使用示例：**

```javascript
// 执行远程命令
const result = await ctx.actions.ssh.exec(
  { host: '192.168.1.100', user: 'deploy', privateKeyFile: '~/.ssh/id_rsa' },
  'ls -la',
  '/opt/app'  // remoteDir（可选）
)
console.log(result.stdout)

// 复制文件到远程
await ctx.actions.ssh.scpFile(
  { host: '192.168.1.100', user: 'deploy', privateKeyFile: '~/.ssh/id_rsa' },
  './app.tar.gz',
  '/opt/app/app.tar.gz'
)
```

### ctx.actions.web - Web 前端构建

| 方法 | 说明 |
|------|------|
| `web.build(opts)` | 构建前端应用并打包 |

**build 参数：**

```typescript
interface WebBuildOptions {
  pm: 'npm' | 'pnpm' | 'yarn' | 'bun'  // 包管理器
  workDir: string                       // 工作目录
  target: string                        // 构建命令（如 'build'）
  outputDir: string                     // 输出目录
  suffix?: string                       // 文件名后缀（可选）
  subdir?: string                       // 子目录（可选）
  installFlags?: string[]               // 安装标志（可选）
  buildFlags?: string[]                 // 构建标志（可选）
}
```

**使用示例：**

```javascript
const archivePath = await ctx.actions.web.build({
  pm: 'npm',
  workDir: ctx.projectRoot,
  target: 'build',
  outputDir: './releases'
})
// 返回打包文件路径，如: ./releases/myapp-1.0.0.tar.gz
```

### ctx.actions.docker - Docker Compose 操作

| 方法 | 说明 |
|------|------|
| `docker.compose(workDir, tplFile, commands, preCommands)` | 本地 Docker Compose |
| `docker.composeOnRemote(sshConfig, targetDir, tplFile, commands, preCommands)` | 远程 Docker Compose |

**使用示例：**

```javascript
// 本地 docker-compose
await ctx.actions.docker.compose(
  '/path/to/project',
  'docker-compose.yml',
  'up -d',           // docker-compose 命令
  'mkdir -p data'    // 预处理命令（可选）
)

// 远程 docker-compose
await ctx.actions.docker.composeOnRemote(
  { host: '192.168.1.100', user: 'deploy', privateKeyFile: '~/.ssh/key' },
  '/opt/app',
  'docker-compose.yml',
  'up -d --build'
)
console.log(`${info.name}@${info.version}`)

// 安装依赖
await ctx.actions.node.install({
  workspace: ctx.projectRoot,
  pm: 'pnpm',
  flags: ['--frozen-lockfile']
})

// 构建
await ctx.actions.node.build({
  workspace: ctx.projectRoot,
  pm: 'pnpm'
})

// 执行自定义命令
await ctx.actions.node.execute({
  workspace: ctx.projectRoot,
  pm: 'pnpm',
  command: 'test',
  flags: ['--coverage']
})
```

### ctx.utils - 工具函数

| 方法 | 说明 |
|------|------|
| `getPackageVersion({ workspace, subdir })` | 获取 package.json 中的版本号 |
| `templateReplace({ sourceFile, targetFile, variables })` | 替换模板文件中的变量 |
| `tar({ sourceDir, filename, outputDir, zip })` | 打包目录为 tar 或 tar.gz |

**使用示例：**

```javascript
// 获取版本号
const version = await ctx.utils.getPackageVersion({
  workspace: ctx.projectRoot,
  subdir: 'omni_sse'  // 可选子目录
})

// 替换模板变量
await ctx.utils.templateReplace({
  sourceFile: './docker-compose.tpl.yml',
  targetFile: './docker-compose.yml',
  variables: {
    PROJECT_NAME: 'my-app',
    DOCKER_IMAGE: `myapp:${version}`,
    PORT: '3000'
  }
})

// 打包为 tar.gz (默认)
await ctx.utils.tar({
  sourceDir: './dist',
  filename: 'my-app-1.0.0',
  outputDir: './releases'
})
// 生成: ./releases/my-app-1.0.0.tar.gz

// 打包为 tar (不压缩)
await ctx.utils.tar({
  sourceDir: './dist',
  filename: 'my-app-1.0.0',
  outputDir: './releases',
  zip: false
})
// 生成: ./releases/my-app-1.0.0.tar
```

### ctx.environment - 环境属性

| 属性 | 说明 |
|------|------|
| `name` | 环境名称（如 'test'、'prod'） |
| `config` | 完整的环境配置对象 |
| `config.branch` | 该环境的目标分支 |
| `config.merge_from` | 合并来源分支（可选） |
| `config.vars` | 环境特定变量 |
| `config.description` | 环境描述（可选） |

**使用示例：**

```javascript
// 获取环境名称
const envName = ctx.environment.name  // 'test' 或 'prod'

// 获取环境分支
const branch = ctx.environment.config.branch  // 'main-test'

// 获取合并来源（如果配置了）
const mergeFrom = ctx.environment.config.merge_from  // 'dev-main'

// 获取环境特定变量
const envVars = ctx.environment.config.vars  // { DEPLOY_HOST: 'test.example.com' }

// 根据环境执行不同逻辑
if (envName === 'prod') {
  console.log('🚀 部署到生产环境！')
  // 生产环境特定逻辑
} else if (envName === 'test') {
  console.log('🧪 部署到测试环境...')
  // 测试环境特定逻辑
}

// 通过环境变量访问（另一种方式）
const envName2 = ctx.env.ENVIRONMENT  // 同 ctx.environment.name
const branch2 = ctx.env.BRANCH        // 同 ctx.environment.config.branch
```

## 变量优先级

变量合并顺序（后者覆盖前者）：

```
omniflow.env (全局环境变量)
    ↓
environments[].vars (环境变量)
```

**注意：** 变量合并支持深度合并。对于对象类型的变量，只会覆盖指定的属性，不会丢失其他属性。

示例：

```yaml
omniflow:
  env:
    REGISTRY: docker.example.com    # 全局
    NAMESPACE: company
    deploy_config:                  # 对象类型
      timeout: 300
      retries: 3

projects:
  - name: user-service
    environments:
      - name: test
        vars:
          DEPLOY_HOST: test.example.com
          deploy_config:            # 深度合并
            timeout: 60             # 只覆盖 timeout，保留 retries: 3
      - name: prod
        vars:
          DEPLOY_HOST: prod.example.com
```

最终 test 环境的 `deploy_config` 为：
```javascript
{
  timeout: 60,    // 被环境变量覆盖
  retries: 3      // 从全局变量继承
}
```

## 项目结构

```
配置仓库 (通过 OMNIFLOW_CONFIG_REPO 指定):
└── config.yaml              # 统一调度入口

项目仓库:
my-app.git/
├── omniflow/
│   └── deploy.js           # 部署脚本
├── src/
└── package.json

配置结构示例:
projects:
  - name: omni-gate          # 文件夹
    items:
      - name: platform       # 项目
        environments: [...]
      - name: micro-services # 嵌套文件夹
        type: folder
        items:
          - name: test       # 环境
          - name: prod       # 环境
```

## 配置说明

### 项目类型

**folder (分组)** - 用于组织项目，变量会被子项继承：
```yaml
- name: app-platform
  type: folder
  vars:                    # 可选，子项目继承
    NAMESPACE: company/app
  items:                   # 必需，子项列表
    - name: user-service
```

**project (项目)** - 实际项目，包含仓库和环境：
```yaml
- name: user-service
  type: project            # 可选，默认就是 project
  vars:                    # 可选，项目变量
    REPLICAS: "3"
  repos:                   # 必需
    git: https://...
    # merge_strategy: github  # 可选（未设置时使用 GIT_MERGE_STRATEGY 环境变量）
  environments:            # 必需
    - name: test
```

**注意：** `merge_strategy` 也可以通过 `GIT_MERGE_STRATEGY` 环境变量全局设置。如果项目配置中未指定，则使用环境变量的值。

### 环境配置

```yaml
environments:
  - name: test              # 环境名称
    description: 测试环境    # 描述
    branch: main-test       # 目标分支
    merge_from: dev-main    # 合并来源分支（可选）
    vars:                   # 环境变量（可选）
      API_URL: https://test.api.com
```

### 项目命令配置

命令定义在项目级别，所有环境共享相同的命令列表：

```yaml
- name: my-project
  description: 我的项目
  repos:
    git: ${GIT_REPOS}/my-project.git
  commands:               # 项目级别的命令定义
    - name: deploy
      description: 部署应用
      script: omniflow/deploy.js    # 脚本路径（相对于项目根目录）
    - name: build-frontend
      description: 构建前端
      folder: frontend              # 命令所在子目录
      script: omniflow/build.js     # 脚本路径（相对于 folder 目录）
      appName: web-app              # 应用名称（传递给脚本）
    - name: deploy-backend
      description: 部署后端服务
      folder: backend
      script: omniflow/deploy.js
      appName: api-server
      args:                          # 命令级别参数
        PORT: "8080"
        NODE_ENV: production
  environments:
    - name: test
      branch: main-test
    - name: prod
      branch: main
```

**命令字段说明：**

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 命令名称，用于执行时指定 |
| `description` | string | 否 | 命令描述 |
| `folder` | string | 否 | 命令所在子目录（相对于项目根目录） |
| `script` | string | 是 | 脚本路径（相对于项目根目录或 folder 目录） |
| `appName` | string | 否 | 应用名称，传递给脚本 |
| `args` | object | 否 | 命令级别参数，合并到 context.env 中 |

**脚本执行：**

```javascript
// 脚本接收参数: (context, folder, appName, args)
export default async function deployScript(context, folder, appName, args) {
  console.log('folder:', folder)        // 来自 command.folder
  console.log('appName:', appName)      // 来自 command.appName
  console.log('args:', args)            // 来自 command.args
  console.log('env:', context.env)     // 合并后的环境变量

  // 执行部署逻辑
  // ...
}
```

**脚本路径解析：**

1. 如果指定了 `folder`，脚本基础目录为 `<projectRoot>/<folder>`
2. `script` 路径相对于基础目录
3. 例如：`folder: frontend`, `script: omniflow/build.js`
   - 完整路径：`<projectRoot>/frontend/omniflow/build.js`
    - name: prod
      branch: main
```

**命令脚本路径解析：**
1. 如果指定了 `script` 字段，使用该路径
2. 如果 `name` 以 `./` 开头，直接使用该路径
3. 默认使用 `./modules/<command-name>` 作为路径

### 全局配置

```yaml
omniflow:
  env:                      # 全局环境变量
    REGISTRY: docker.aliyun.com
  git:                      # Git 配置
    repos: https://git.example.com
    username: ${GIT_USERNAME}
  ssh:                      # SSH 服务器配置
    test:
      server: test.example.com
      user: deploy
      private_key_file: ~/.ssh/id_rsa
```

## 更多文档

- [架构设计](docs/architecture.md)
- [完整配置示例](examples/config.yaml)
- [部署脚本示例](examples/scripts/deploy.js)
- [公共命令库示例](examples/commands.js)

## License

MIT