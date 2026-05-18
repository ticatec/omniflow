# Omniflow 架构设计

## 核心理念

Omniflow 采用**统一调度入口 + 项目自管理 pipeline**的架构：

- **config.yaml** - 统一调度入口，从 git 获取，管理所有 CI/CD 项目
- **项目仓库** - 每个项目的 pipeline 脚本在自己的代码仓库中管理

## 架构层次

```
环境变量:
  OMNIFLOW_CONFIG_REPO=https://git.example.com/omniflow/config.git  # 必需
  OMNIFLOW_HOME=~/.omniflow                                         # 可选
  GIT_USERNAME=xxx                                                  # 可选
  GIT_TOKEN=xxx                                                     # 可选
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                    ~/.omniflow/                                  │
│                    工作目录                                      │
├─────────────────────────────────────────────────────────────────┤
│  config/                 # 配置目录                             │
│    ├── config.yaml       # 统一调度配置（从git获取）            │
│    └── commands.js       # 公共命令库（从git获取，可选）        │
│  data/                   # 项目根目录                           │
│    └── <project-path>/   # 项目代码（从git获取）                │
│                           路径与config.yaml中projects结构对应   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    git repository: config.git                   │
│                    统一调度入口 - 配置中心                       │
├─────────────────────────────────────────────────────────────────┤
│  omniflow:                                                     │
│    env: { 全局变量 }                                            │
│    git: { 全局Git配置 }                                         │
│    ssh: { 服务器配置 }                                          │
│  projects:                                                     │
│    - [应用平台组] folder                                       │
│      vars: { 分组变量 }                                         │
│      items:                                                    │
│        - [平台服务] project                                    │
│          vars: { 项目变量 }                                     │
│          repos: { git: xxx.git }                              │
│          environments: [test, prod]                            │
│        - [用户服务] project                                    │
│          repos: { git: xxx.git }                              │
│    - [供应链系统] folder                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    项目仓库 (omni-gate/platform.git)            │
├─────────────────────────────────────────────────────────────────┤
│  omniflow/deploy.js      # 部署脚本（项目自管理）              │
│  src/                    # 源代码                               │
│  package.json            # 版本号                                │
└─────────────────────────────────────────────────────────────────┘
```

## 配置文件职责

### config.yaml (配置仓库中)

**作用**: 统一调度入口，目录组织

**包含**:
- 全局环境变量 (`omniflow.env`)
- 全局 Git 配置 (`omniflow.git`)
- SSH 服务器配置 (`omniflow.ssh`)
- 项目列表 (目录结构)
- 分组/项目的仓库地址、环境定义、变量

**位置**: 由 `OMNIFLOW_CONFIG_REPO` 环境变量指定的 git 仓库

### omniflow/deploy.js (项目仓库中)

**作用**: 实际的 pipeline 脚本

**特点**:
- 由项目自己管理，可以随时修改
- 可以提交到项目仓库进行版本控制
- 可以使用项目的代码和工具

### commands.js (配置仓库中，可选)

**作用**: 公共命令库，所有项目的 pipeline 都可以使用

**特点**:
- 集中管理常用的部署命令（SSH、Docker 等）
- 减少重复代码，提高复用性
- 与 config.yaml 同级，位于配置仓库根目录

**使用方式**:
```javascript
// omniflow/deploy.js 中
export default async function pipeline(ctx) {
  const { commands } = ctx

  // SSH 远程执行
  await commands.sshExec({
    host: '192.168.1.5',
    user: 'deploy',
    command: `
      cd /opt/app
      npm install
      npm run build
    `
  })

  // 远程部署（封装版）
  await commands.remoteDeploy({
    host: env.DEPLOY_HOST,
    user: 'deploy',
    remotePath: '/opt/app',
    command: `
      npm install
      pm2 restart app
    `
  })

  // Docker 部署
  await commands.dockerDeploy({
    image: 'myapp:latest',
    container: 'myapp',
    host: '192.168.1.5',
    user: 'deploy'
  })

  // 工具函数
  const version = commands.utils.buildVersion('v')
}
```

**内置命令**:
- `sshExec()` - SSH 远程执行命令
- `remoteDeploy()` - 远程部署封装
- `dockerDeploy()` - Docker 容器部署
- `dockerBuild()` - Docker 镜像构建
- `utils` - 工具函数集合（版本号、日期格式化等）

## 工作区结构

```
~/.omniflow/
├── config/
│   ├── config.yaml       # 从配置仓库获取
│   └── commands.js       # 从配置仓库获取
└── data/
    └── <project-key>/    # 项目路径与config.yaml中结构对应
        └── <cloned-repo>/ # 从项目仓库git clone
```

示例：
```
~/.omniflow/data/omni-gate/platform/          # 平台项目
~/.omniflow/data/omni-gate/micro-services/user/auth/  # 认证服务
~/.omniflow/data/supply-nexus/platform/       # 供应链平台
```

项目路径映射规则：
- config.yaml 中的 `projects` 结构直接映射到 `data/` 目录
- folder 类型项创建目录
- project 类型项从其 git 地址克隆代码到对应路径

## 项目类型

### folder (分组)

用于组织项目，变量会被子项继承：

```yaml
- name: app-platform
  type: folder
  vars:                    # 可选，子项目继承
    DEPLOY_REGION: us-east-1
  items:                   # 必需
    - name: user-service
```

### project (项目)

实际项目，包含仓库和环境：

```yaml
- name: user-service
  vars:                    # 可选，项目变量
    REPLICAS: "3"
  repos:                   # 必需
    git: https://...
  environments:            # 必需
    - name: test
```

## 变量优先级

变量合并顺序（后者覆盖前者）：

```
omniflow.env (全局)
    ↓
folder.vars (可选)
    ↓
project.vars (可选)
    ↓
environments[].vars (环境)
```

示例：

```yaml
omniflow:
  env:
    REGISTRY: docker.example.com
    NAMESPACE: company

projects:
  - name: app-platform
    type: folder
    vars:
      NAMESPACE: company/app     # 覆盖全局
    items:
      - name: user-service
        vars:
          REPLICAS: "3"          # 覆盖分组
        environments:
          - name: test
            vars:
              REPLICAS: "1"      # 覆盖项目
```

## 分支合并流程

当配置了 `merge_from` 和 `merge_strategy` 时：

1. 创建 PR/MR（source → target）
2. 立即自动合并

示例配置：
```yaml
repos:
  git: https://git.example.com/project.git
  merge_strategy: github      # github, gitlab, forgejo（可选）
environments:
  - name: prod
    branch: main
    merge_from: dev
```

## 使用流程

```bash
# 1. 设置配置仓库地址
export OMNIFLOW_CONFIG_REPO=https://git.example.com/omniflow/config.git

# 2. 编辑配置仓库中的 config.yaml 添加项目

# 3. 在项目仓库创建 omniflow/deploy.js

# 4. 执行部署
omniflow run app-platform/user-service test

# 5. 查看项目列表
omniflow list projects

# 6. 查看环境
omniflow list environments app-platform/user-service

# 7. 查看可用命令
omniflow list commands app-platform/user-service test

# 8. 更新本地配置缓存
omniflow reload
```

## 脚本上下文

部署脚本中可用的对象：

```javascript
export default async function pipeline(ctx) {
  // 工作区信息
  ctx.workspace      // 工作区路径 (~/.omniflow/project/...)
  ctx.projectRoot    // 项目根目录（同 workspace）

  // 公共命令库（来自配置仓库的 commands.js）
  ctx.commands       // { sshExec, remoteDeploy, dockerDeploy, utils }

  // 环境变量
  ctx.env            // 合并后的环境变量

  // 项目信息
  ctx.project.key    // 'app-platform/user-service'
  ctx.project.name   // '用户服务'
  ctx.project.description

  // 环境信息
  ctx.environment.name        // 'test'
  ctx.environment.config      // 环境配置对象

  // Git 信息
  ctx.git.url         // 仓库 URL
  ctx.git.branch      // 当前分支
  ctx.git.commit      // commit hash

  // 命令信息（如果指定了命令）
  ctx.command.name         // 'frontend-deploy'
  ctx.command.description

  // Omniflow 配置
  ctx.omniflow       // config.omniflow 全局配置

  // 其他
  ctx.verbose        // 是否 verbose 模式
}
```

## 配置缓存

首次运行时从 git 获取配置并缓存，后续运行使用缓存：

```bash
omniflow run app-platform/user-service test  # 使用缓存的配置
omniflow reload                               # 从 git 更新缓存
```

## 本地代码更新策略

每次执行部署时：

1. 如果工作区已存在：`git fetch && git reset --hard origin/<branch>`
2. 如果工作区不存在：`git clone --depth 1 --single-branch`
3. 清理未跟踪的文件：`git clean -fd`

这确保本地代码始终与远程保持一致。