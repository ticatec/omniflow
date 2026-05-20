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
- **简洁 Actions** - git, shell, log 三个核心操作
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

在配置仓库中创建 `commands.js`，定义可被所有项目使用的公共命令：

```javascript
/**
 * Omniflow 公共命令库
 * 位置：配置仓库根目录 (与 config.yaml 同级)
 */

import { $ } from 'zx'

/**
 * SSH 远程执行命令
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
 * 远程部署
 */
export async function remoteDeploy({ host, user, remotePath, commands, env = {} }) {
  const cmdStr = Array.isArray(commands) ? commands.join(' && ') : commands
  const fullCommand = `cd ${remotePath} && ${cmdStr}`
  return await sshExec({ host, user, command: fullCommand.trim(), env })
}

/**
 * 工具函数集合
 */
export const utils = {
  formatDate: (date = new Date()) => date.toISOString(),
  buildVersion: (prefix = 'v') => `${prefix}${Date.now()}`,
  uuid: () => Math.random().toString(36).substring(2, 15),
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))
}

// 默认导出 - 包含所有命令
export default {
  sshExec,
  remoteDeploy,
  utils
}
```

**加载机制：**
- commands.js 在 CLI 统一加载（`OmniflowConfigLoader.loadCommands()`）
- 作为 `ctx.commands` 传递给子命令脚本
- 支持命名导出和默认导出

**使用方式：**
```javascript
// 在项目部署脚本中使用
export default async function pipeline(ctx) {
  await ctx.commands.sshExec({ host: '192.168.1.5', user: 'deploy', command: 'npm run build' })
  await ctx.commands.remoteDeploy({ host: 'test.server', user: 'deploy', remotePath: '/opt/app', commands: ['pm2 restart app'] })
  
  const version = ctx.commands.utils.buildVersion()
}
```

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
  const { git, shell, log } = ctx.actions
  const { env, globals, secrets, system } = ctx

  await log.info(`部署 ${system.PROJECT_NAME} v${system.PACKAGE_VERSION}`)

  await shell.script({
    script: `
      cd ${system.WORKPLACE}
      npm install
      npm run build
      # ... 部署步骤
    `
  })

  await log.success('部署完成!')
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

部署脚本中可用的对象：

```javascript
export default async function pipeline(ctx) {
  // 工作区信息
  ctx.workspace       // 工作区路径
  ctx.projectRoot     // 项目根目录

  // 项目信息
  ctx.project.key     // 'my-app/platform'
  ctx.project.name    // '平台服务'
  ctx.project.description  // 项目描述

  // 环境信息
  ctx.environment.name      // 'test'
  ctx.environment.config    // 环境配置对象

  // 命令信息
  ctx.command.name         // 'frontend-deploy'
  ctx.command.description  // '部署前端应用'

  // Git 信息
  ctx.git.url      // 项目 git 仓库地址
  ctx.git.branch   // 当前分支
  ctx.git.commit   // 当前 commit hash

  // 环境变量
  ctx.env          // 合并后的环境变量 (global -> folder -> project -> environment)

  // Omniflow 配置
  ctx.omniflow     // config.yaml 中的 omniflow 配置

  // 系统操作 (actions)
  ctx.actions.log.info(msg)       // 输出信息
  ctx.actions.log.success(msg)    // 输出成功信息
  ctx.actions.log.error(msg)      // 输出错误信息
  ctx.actions.shell.exec(cmd)     // 执行 shell 命令
  ctx.actions.git.clone(opts)     // 克隆 git 仓库

  // 工具函数 (utils)
  ctx.utils.getPackageVersion({ workspace, subdir })  // 获取 package.json 版本
  ctx.utils.templateReplace({ sourceFile, targetFile, variables })  // 替换模板变量

  // 公共命令库 (从 commands.js 加载)
  ctx.commands     // commands.js 导出的命令对象

  // 系统别名 (向后兼容)
  ctx.system       // { WORKSPACE, WORKPLACE, PROJECT_NAME, PACKAGE_VERSION }

  // 选项
  ctx.verbose      // 是否启用详细输出
}
```

### ctx.actions - 系统操作

| 方法 | 说明 |
|------|------|
| `log.info(msg)` | 输出信息日志 |
| `log.success(msg)` | 输出成功日志 |
| `log.error(msg)` | 输出错误日志 |
| `log.warn(msg)` | 输出警告日志 |
| `shell.exec(cmd)` | 执行 shell 命令 |
| `git.clone(opts)` | 克隆 git 仓库 |

### ctx.utils - 工具函数

| 方法 | 说明 |
|------|------|
| `getPackageVersion({ workspace, subdir })` | 获取 package.json 中的版本号 |
| `templateReplace({ sourceFile, targetFile, variables })` | 替换模板文件中的变量 |

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
omniflow.env (全局)
    ↓
分组.vars (folder，可选)
    ↓
项目.vars (project，可选)
    ↓
environments[].vars (环境)
```

示例：`omniflow run app-platform/user-service test`

```yaml
omniflow:
  env:
    REGISTRY: docker.example.com    # 全局
    NAMESPACE: company

projects:
  - name: app-platform
    type: folder
    vars:
      NAMESPACE: company/app         # 覆盖全局
      DEPLOY_REGION: us-east-1
    items:
      - name: user-service
        vars:
          DEPLOY_REGION: us-west-2   # 覆盖分组
          REPLICAS: "3"
        environments:
          - name: test
            vars:
              REPLICAS: "1"          # 覆盖项目
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
- name: platform
  description: 平台服务
  repos:
    git: ${GIT_REPOS}/my-app/platform.git
  commands:               # 项目级别的命令定义
    - name: deploy
      description: 部署应用
      script: ./omniflow/deploy.js    # 脚本路径（相对于项目根目录）
    - name: rollback
      description: 回滚版本
      script: ./omniflow/rollback.js
  environments:
    - name: test
      branch: main-test
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