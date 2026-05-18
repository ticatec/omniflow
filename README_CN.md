# Omniflow - CI/CD Pipeline Manager

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
└── data/                # 项目根目录
    └── <project-key>/   # 项目路径与 config.yaml 结构对应
        └── <cloned-repo>/  # 从项目 git 仓库克隆
```

示例：
```
~/.omniflow/
├── config/
│   ├── config.yaml      # 从 OMNIFLOW_CONFIG_REPO 获取
│   └── commands.js      # 从 OMNIFLOW_CONFIG_REPO 获取
└── data/
    ├── my-app/platform/         # 平台项目
    └── my-app/micro-services/   # 微服务分组
        └── user/
            └── auth/            # 认证服务项目
```

**项目路径映射规则：**
- config.yaml 中的 `projects` 结构直接映射到 `data/` 目录
- `folder` 类型项创建目录
- `project` 类型项从其 git 地址克隆代码到对应路径

### 3. 创建配置仓库

配置仓库应包含以下文件：

```
config.git/
├── config.yaml       # 必需：统一调度配置
└── commands.js       # 可选：公共命令库
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
        environments:          # 项目必需
          - name: test
            description: 测试环境
            branch: main-test
            merge_from: dev-main
            vars:              # 环境变量（覆盖项目）
              DEPLOY_HOST: test.platform.example.com
            commands:
              - name: frontend-deploy
                description: 部署前端应用
              - name: backend-build
                description: 制作docker镜像
          - name: prod
            description: 生产环境
            branch: main
            merge_from: main-test
            commands:
              - name: frontend-deploy
              - name: backend-build

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

### 3. 创建部署脚本

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

### 4. 执行部署

```bash
# 部署平台服务的测试环境
omniflow run my-app/platform test

# 部署微服务的生产环境
omniflow run my-app/micro-services prod

# 执行特定命令
omniflow run my-app/platform test frontend-deploy
```

## CLI 命令

```bash
# 运行部署（使用缓存的配置）
omniflow run <project-path> <environment> [command]
# project-path 支持嵌套路径，如: my-app/platform

# 列出所有项目
omniflow list projects

# 列出项目的环境
omniflow list environments <project-path>

# 列出环境的可用命令
omniflow list commands <project-path> <environment>

# 查看项目详情
omniflow show <project-path> [environment]

# 清理工作区
omniflow clean [project-path]

# 重新加载配置（从 git 获取最新配置并更新 config/）
omniflow reload
```

## 脚本上下文

部署脚本中可用的对象：

```javascript
export default async function pipeline(ctx) {
  // Actions
  ctx.actions.git.clone({ url, branch, path })
  ctx.actions.shell.script({ script: '...' })
  ctx.actions.log.info('message')

  // 变量
  ctx.env          // 合并后的环境变量
  ctx.globals      // config.yaml 中项目定义的 vars
  ctx.secrets      // 密钥
  ctx.system       // 系统变量 (VERSION, WORKSPACE, etc.)

  // 项目信息
  ctx.project.path     // 'my-app/platform'
  ctx.project.name     // '平台服务'
  ctx.environment.name // 'test'
  ctx.environment.description // '测试环境'
  ctx.git.branch       // 'main-test'
  ctx.git.mergeFrom    // 'dev-main'
  ctx.git.commit       // commit hash
  ctx.command.name     // 'frontend-deploy' (如果指定了命令)
}
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
  environments:            # 必需
    - name: test
```

### 环境配置

```yaml
environments:
  - name: test              # 环境名称
    description: 测试环境    # 描述
    branch: main-test       # 目标分支
    merge_from: dev-main    # 合并来源分支（可选）
    merge_strategy: github  # MR/PR 策略: github, gitlab, forgejo（可选）
    vars:                   # 环境变量（可选）
      API_URL: https://test.api.com
    commands:               # 可用命令列表（可选）
      - name: deploy
        description: 部署应用
      - name: rollback
        description: 回滚版本
```

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
- [项目结构示例](examples/project-structure.md)
- [完整配置示例](examples/config_omni_gate.yaml)
- [部署脚本示例](examples/scripts/deploy.js)
- [环境变量配置](.env.example)

## License

MIT