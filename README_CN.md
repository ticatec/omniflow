# Omniflow - CI/CD Pipeline Manager

[![npm version](https://badge.fury.io/js/%40ticatec%2Fomniflow.svg)](https://www.npmjs.com/package/@ticatec/omniflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](./README.md)

统一的 CI/CD 项目调度管理工具，采用**统一调度入口 + 项目自管理 pipeline**的架构。

## 核心设计

```
OMNIFLOW_CONFIG_REPO (环境变量) → 配置仓库地址
        ↓
每次运行时从 git 获取 omniflow.yaml  → 统一调度入口，定义所有项目和环境
        ↓
项目仓库/omniflow/deploy.js → 部署脚本，项目自己管理
```

## 特性

- **统一调度入口** - 一个配置文件管理所有 CI/CD 项目
- **配置来自 Git** - 从 git 仓库获取 omniflow.yaml 和 commands.js
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
npm run start -- run -e test omni-gate/platform backend:build
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
│   ├── omniflow.yaml      # 统一调度配置（从 git 获取）
│   └── bin/
│       └── index.js       # 公共命令库（从 git 获取，可选）
└── project/             # 项目工作区
    └── <project-key>/   # 项目路径与 omniflow.yaml 结构对应
```

示例：
```
~/.omniflow/
├── config/
│   ├── omniflow.yaml      # 从 OMNIFLOW_CONFIG_REPO 获取
│   └── bin/
│       └── index.js       # 从 OMNIFLOW_CONFIG_REPO 获取
└── project/
    ├── my-app/platform/   # 项目克隆到这里
    └── my-app/micro-services/user/auth/
```

**项目路径映射规则：**
- omniflow.yaml 中的 `projects` 结构直接映射到 `project/` 目录
- `folder` 类型项创建目录结构
- `project` 类型项从其 git 地址克隆代码到对应路径
- 每次运行时根据指定的环境切换到对应分支

### 3. 创建配置仓库

配置仓库应包含以下文件：

```
config.git/
├── omniflow.yaml       # 必需：统一调度配置
└── bin/
    └── index.js        # 可选：公共命令库
```

### 4. 创建公共命令库（可选）

在配置仓库的 `bin/` 目录下创建 `index.js`，定义可被所有项目使用的公共命令。

**工作原理：**
- 在配置仓库中编辑 `bin/index.js`
- 运行 `omniflow update` 将文件复制到本地 `plugins/` 目录
- Omniflow 从 `plugins/index.js` 加载命令（这样可以共享 omniflow 的依赖）

**文件格式要求：**
- 位置：配置仓库的 `bin/index.js`
- 必须导出一个默认函数 `export default function loadCommands(actions, utils, mergedVars)`
- 函数接收 omniflow 提供的 `actions`、`utils` 和 `mergedVars` 作为参数
- 函数返回一个包含自定义命令的对象

**完整示例：**

```javascript
/**
 * Omniflow 公共命令库
 * 位置：配置仓库/bin/index.js
 *
 * 必须导出默认函数：
 * export default function loadCommands(actions, utils, mergedVars) { return {...} }
 */

// 导入各模块（如果需要分文件组织）
// import * as node from './commands/node.js';
// import * as docker from './commands/docker.js';

/**
 * loadCommands - omniflow 加载命令的入口函数
 * @param {Object} actions - omniflow 提供的核心操作
 * @param {Object} utils - omniflow 提供的工具函数
 * @param {Object} mergedVars - 合并后的环境变量 (omniflow.env + environment.vars)
 * @returns {Object} 自定义命令对象
 *
 * actions 包含:
 *   - shell: { exec(cmd) } - shell 命令执行
 *   - git: { clone(opts) } - git 操作
 *   - node: { install, build, execute, getPackageInfo, ... } - Node.js 操作
 *   - ssh: { exec, cp } - SSH/SCP 操作
 *   - web: { build(opts) } - Web 前端构建
 *   - docker: { compose, composeOnRemote } - Docker Compose 操作
 *
 * utils 包含:
 *   - formatTemplateFile({ sourceFile, targetFile, variables })
 *   - formatTemplate(content, variables)
 *   - mergeComposeEnv({ envInputs, indent })
 *   - tar({ sourceDir, filename, outputDir })
 *
 * mergedVars 包含:
 *   - 全局环境变量 omniflow.env 和环境变量 environment.vars 合并后的结果
 *   - 可以直接在自定义命令中使用这些变量
 */
export default function loadCommands(actions, utils, mergedVars) {
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
    await ssh.cp(sshConfig, archivePath, remoteTarPath)

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
// .omniflow/pipeline.js
async function build(ctx, folder, args) {
  // ctx.commands 包含从 bin/index.js 加载的自定义命令

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

// 导出所有函数
export { build }
```

**可用的 actions：**

| 操作 | 说明 | 方法 |
|------|------|------|
| `shell` | Shell 命令执行 | `exec(cmd)` |
| `node` | Node.js 操作 | `install`, `build`, `execute`, `getPackageInfo` |
| `ssh` | SSH/SCP 操作 | `exec(config, command, remoteDir)`, `cp(config, srcFile, targetFolder)` |
| `web` | Web 前端构建 | `build(opts)` |
| `docker` | Docker Compose | `compose(targetDir, tplFile, preCommands)`, `composeOnRemote(sshConfig, targetDir, tplFile, preCommands)` |

**可用的 utils：**

| 方法 | 说明 |
|------|------|
| `formatTemplateFile({ sourceFile, targetFile, variables })` | 格式化模板文件并写入 |
| `formatTemplate(content, variables)` | 格式化模板字符串，返回结果 |
| `mergeComposeEnv({ envInputs, indent })` | 合并 Docker Compose 环境变量 |
| `tar({ sourceDir, filename, outputDir, zip })` | 打包目录为 tar 或 tar.gz |

### 4. 编辑配置文件

在配置仓库中编辑 `omniflow.yaml` 添加项目：

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
        modules:              # 模块配置（所有环境共享）
          - name: frontend
            description: 前端应用
            folder: web
            appName: web-app
            commands:
              - name: build
                description: 构建前端
              - name: deploy
                description: 部署前端
                args:
                  PORT: "3000"
          - name: backend
            description: 后端服务
            folder: api
            appName: api-server
            commands:
              - name: build
                description: 构建Docker镜像
              - name: push
                description: 推送镜像
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

      # 项目：用户服务（单一模块，folder为空表示脚本在项目根目录）
      - name: user-service
        description: 用户服务
        vars:
          REPLICAS: "3"
        repos:
          git: ${GIT_REPOS}/my-app/user-service.git
        modules:
          - name: main
            description: 主服务
            commands:
              - name: build
              - name: deploy
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
        modules:
          - name: service
            commands:
              - name: build
              - name: deploy
        environments:
          - name: test
            branch: main-test
          - name: prod
            branch: main
```

### 5. 创建部署脚本

**重要：每个模块必须在对应的目录下创建 `.omniflow/pipeline.js` 文件才能执行 CI/CD。**

脚本文件位置规则：
- 有 `folder` 配置：脚本位于 `<projectRoot>/<folder>/.omniflow/pipeline.js`
- 无 `folder` 配置（空）：脚本位于 `<projectRoot>/.omniflow/pipeline.js`

在项目仓库创建模块脚本文件：

```javascript
// web/.omniflow/pipeline.js (模块 folder 目录下)

// 构建Docker镜像
async function build_docker(ctx, folder, args) {
  const { env } = ctx

  console.log(`构建Docker镜像`)
  const workDir = folder ? `${ctx.projectRoot}/${folder}` : ctx.projectRoot
  
  // 构建逻辑...
}

// 部署容器
async function compose(ctx, folder, args) {
  const { env } = ctx
  
  console.log(`部署容器，端口: ${args.port || '3000'}`)
  const workDir = folder ? `${ctx.projectRoot}/${folder}` : ctx.projectRoot
  
  // 部署逻辑...
}

// 导出所有函数（ES模块语法）
export { build_docker, compose }
```

**项目仓库结构示例：**
```
my-app.git/
├── web/
│   └── .omniflow/
│       └── pipeline.js    # frontend 模块的脚本（必需）
├── api/
│   └── .omniflow/
│       └── pipeline.js    # backend 模块的脚本（必需）
├── src/
└── package.json
```

**配置对应关系：**
```yaml
modules:
  - name: frontend
    folder: web           # 对应 web/.omniflow/pipeline.js
    commands:
      - name: build_docker # 调用 build_docker() 函数
      - name: compose      # 调用 compose() 函数
      - name: deploy       # 调用 deploy() 函数
  - name: backend
    folder: api           # 对应 api/.omniflow/pipeline.js
    commands:
      - name: build        # 调用 build() 函数
      - name: deploy       # 调用 deploy() 函数
```

### 6. 执行部署

```bash
# 执行单个模块的命令
omniflow run -e test my-app/platform backend:build

# 跨模块执行多个命令
omniflow run -e test my-app/platform backend:build frontend:deploy backend:push

# 单一模块项目（folder 为空）
omniflow run -e test my-app/user-service main:build
```

## CLI 命令

```bash
# 运行部署（使用缓存的配置）
omniflow run -e <environment> <project-path> <module:command> [module:command...]
# project-path 支持嵌套路径，如: my-app/platform
# 命令格式: module:command，可跨模块执行多个命令

# 列出所有项目
omniflow list projects

# 列出项目的环境
omniflow list environments <project-path>

# 列出项目的模块
omniflow list modules <project-path>

# 列出项目的所有模块和命令
omniflow list commands <project-path>

# 列出指定模块的命令
omniflow list commands <project-path> backend

# 查看项目详情
omniflow show <project-path> [environment]

# 清理工作区
omniflow clean [project-path]

# 更新配置（从 git 获取最新配置）
omniflow update
```

## 脚本上下文

根据命令名称调用对应的具名函数：

```javascript
/**
 * 模块脚本函数示例
 * @param {ScriptContext} context - 脚本上下文对象
 * @param {string} folder - 模块的 folder 配置（空字符串表示项目根目录）
 * @param {Object} args - 命令参数（来自 command.args）
 */
async function build_docker(context, folder, args) {
  // 脚本实现
}

async function deploy(context, folder, args) {
  // 脚本实现
}

// 导出所有函数
export { build_docker, deploy }
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
    formatTemplateFile,        // 替换模板变量
    formatTemplate,            // 格式化模板字符串
    mergeComposeEnv,           // 合并 Docker Compose 环境变量
    tar                        // 打包目录
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
await ctx.actions.ssh.cp(
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
| `node.*` | Node.js 操作（见下文） |
| `ssh.*` | SSH/SCP 操作（见下文） |
| `web.*` | Web 前端构建（见下文） |
| `docker.*` | Docker Compose 操作（见下文） |

### ctx.actions.node - Node.js 操作

| 方法 | 说明 |
|------|------|
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
| `ssh.cp(sshConfig, srcFile, targetFolder)` | 复制文件到远程服务器 |

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
await ctx.actions.ssh.cp(
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
| `docker.compose(targetDir, tplFile, preCommands)` | 本地 Docker Compose |
| `docker.composeOnRemote(sshConfig, targetDir, tplFile, preCommands)` | 远程 Docker Compose |

**使用示例：**

```javascript
// 本地 docker-compose
await ctx.actions.docker.compose(
  '/path/to/project',
  'docker-compose.yml',
  'mkdir -p data'    // 预处理命令（可选）
)

// 远程 docker-compose
await ctx.actions.docker.composeOnRemote(
  { host: '192.168.1.100', user: 'deploy', privateKeyFile: '~/.ssh/key' },
  '/opt/app',
  'docker-compose.yml',
  'mkdir -p /opt/data'  // 预处理命令（可选）
)
```
})

// 执行自定义命令
await ctx.actions.node.execute(ctx.projectRoot, 'pnpm', 'test', ['--coverage'])
```

### ctx.utils - 工具函数

| 方法 | 说明 |
|------|------|
| `formatTemplateFile({ sourceFile, targetFile, variables })` | 格式化模板文件并写入 |
| `formatTemplate(content, variables)` | 格式化模板字符串，返回结果 |
| `mergeComposeEnv({ envInputs, indent })` | 合并 Docker Compose 环境变量 |
| `tar({ sourceDir, filename, outputDir, zip })` | 打包目录为 tar 或 tar.gz |

**模板变量语法：**

使用 `{{key}}` 占位符（与 shell 环境变量 `${var}` 区分），支持嵌套对象访问：

```javascript
// 模板文件内容
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
// 结果: FROM registry.cn-zhangjiakou.aliyuncs.com/ticatec/my-service:1.0.0

// 字符串格式化
const content = 'Hello {{name}}, version is {{app.version}}'
const result = ctx.utils.formatTemplate(content, {
  name: 'World',
  app: { version: '2.0.0' }
})
// result: 'Hello World, version is 2.0.0'
```

**Docker Compose 环境变量合并：**

```javascript
// 合并环境变量（支持数组格式和对象格式）
const envYaml = ctx.utils.mergeComposeEnv({
  envInputs: [
    ['- UID=${MY_UID}', '- GID=${MY_GID}'],  // 数组格式
    {CONFIG_MODE: 'consul', CONSUL_PORT: '8500'}  // 对象格式
  ],
  indent: '    '
})
// 结果:
// '    - UID=${MY_UID}\n    - GID=${MY_GID}\n    - CONFIG_MODE=consul\n    - CONSUL_PORT=8500'
```

**使用示例：**

```javascript
// 获取版本号（使用 node 操作）
const pkgInfo = await ctx.actions.node.getPackageInfo(ctx.projectRoot)
const version = pkgInfo.version

// 格式化模板文件
await ctx.utils.formatTemplateFile({
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

### ctx.environment - 环境名称

`environment` 属性是一个字符串，包含当前环境的名称（如 'test'、'prod'）。

**使用示例：**

```javascript
// 获取环境名称
const envName = ctx.environment  // 'test' 或 'prod'

// 根据环境执行不同逻辑
if (envName === 'prod') {
  console.log('🚀 部署到生产环境！')
  // 生产环境特定逻辑
} else if (envName === 'test') {
  console.log('🧪 部署到测试环境...')
  // 测试环境特定逻辑
}
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
└── omniflow.yaml              # 统一调度入口
└── bin/
    └── index.js               # 公共命令库（可选）

项目仓库:
my-app.git/
├── web/                       # 模块目录
│   └── .omniflow/
│       └── pipeline.js        # 模块脚本
├── api/                       # 模块目录
│   └── .omniflow/
│       └── pipeline.js        # 模块脚本
├── src/
└── package.json

配置结构示例:
projects:
  - name: omni-gate          # 文件夹
    items:
      - name: platform       # 项目
        modules:
          - name: web
            folder: web
          - name: api
            folder: api
        environments: [...]
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

### 项目模块配置

项目通过 `modules` 定义模块，每个模块包含一组命令：

```yaml
- name: my-project
  description: 我的项目
  repos:
    git: ${GIT_REPOS}/my-project.git
  modules:                    # 模块配置
    - name: frontend          # 模块名称（用于命令执行）
      description: 前端应用
      folder: web             # 可选，子目录路径（空表示项目根目录）
      appName: web-app        # 可选，应用名称
      commands:               # 模块包含的命令
        - name: build
          description: 构建前端
        - name: deploy
          description: 部署前端
          args:               # 命令参数
            PORT: "3000"
    - name: backend
      description: 后端服务
      folder: api             # 脚本位于 api/.omniflow/pipeline.js
      commands:
        - name: build
        - name: deploy
  environments:
    - name: test
      branch: main-test
    - name: prod
      branch: main
```

**模块字段说明：**

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 模块名称，用于命令执行 |
| `description` | string | 否 | 模块描述 |
| `folder` | string | 否 | 子目录路径（相对于项目根目录），空表示根目录 |
| `appName` | string | 否 | 应用名称 |
| `commands` | array | 是 | 命令列表 |

**命令字段说明：**

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 命令名称 |
| `description` | string | 否 | 命令描述 |
| `args` | object | 否 | 命令参数 |

**脚本位置：**

脚本文件固定为模块目录下的 `.omniflow/pipeline.js`：
- 有 folder: `<projectRoot>/<folder>/.omniflow/pipeline.js`
- 无 folder: `<projectRoot>/.omniflow/pipeline.js`

**脚本执行：**

根据命令名称调用对应的函数：

```javascript
// .omniflow/pipeline.js

// 函数签名: (context, folder, args)
async function build_docker(context, folder, args) {
  console.log('folder:', folder)        // 来自 module.folder
  console.log('args:', args)            // 来自 command.args
  console.log('env:', context.env)     // 合并后的环境变量

  // 执行部署逻辑
  const workDir = folder ? `${context.projectRoot}/${folder}` : context.projectRoot
  // ...
}

async function compose(context, folder, args) {
  // ...
}

// 导出所有函数
export { build_docker, compose }
```

**调用关系：**
- 命令 `omni-gateway:build_docker` → 调用 `build_docker(context, folder, args)`
- 命令 `omni-gateway:compose` → 调用 `compose(context, folder, args)`
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
- [完整配置示例](examples/omniflow.yaml)
- [部署脚本示例](examples/scripts/deploy.js)
- [公共命令库示例](examples/commands.js)

## License

MIT