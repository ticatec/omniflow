# Omniflow Pipeline 编写指南 (LLM版)

本指南为 LLM (Claude, ChatGPT 等) 提供编写 Omniflow 部署脚本的规范和示例。

---

## 文件位置

```
项目根目录/
└── omniflow/
    └── deploy.js          # 部署脚本 (必填)
```

---

## 基本模板

```javascript
/**
 * Omniflow Deploy Pipeline
 * 功能：[描述此部署脚本的功能]
 */

export default async function pipeline(ctx) {
  const { log } = ctx.actions;
  const { env, system } = ctx;

  // 项目配置
  const projectName = 'your-project-name';
  const workDir = system.WORKPLACE;
  const subdir = 'subdirectory-name';  // 可选，如果项目在子目录

  // 镜像配置
  const namespace = ctx.omniflow.env.NAMESPACE || env.NAMESPACE || 'default-namespace';
  const dockerImage = `${namespace}/${projectName}`;

  // 获取版本号
  const version = ctx.commands.getPackageVersion(workDir, subdir);

  await log.info(`Building ${projectName} version ${version} for ${ctx.environment.name}...`);

  // === 在这里添加你的部署步骤 ===

  await log.success('Deployment complete!');
}
```

---

## ctx 对象可用属性

```javascript
ctx = {
  // === 工作区信息 ===
  workspace: '/Users/xxx/.omniflow/project/xxx',     // Omniflow 工作区
  projectRoot: '/Users/xxx/.omniflow/project/xxx',   // 项目根目录 (同 workspace)

  // === 项目信息 ===
  project: {
    key: 'omni-gate/platform',      // 项目路径
    name: 'Platform Service',        // 项目名称
    description: '项目描述'
  },

  // === 环境信息 ===
  environment: {
    name: 'test',                    // 环境名称 (test/prod)
    config: {                        // 环境配置
      branch: 'test-main',
      merge_from: 'main-dev',
      vars: { ... }
    }
  },

  // === 命令信息 ===
  command: {
    name: 'deploy',                  // 当前命令名称
    description: '部署应用'
  },

  // === Git 信息 ===
  git: {
    url: 'https://git.example.com/repo.git',
    branch: 'test-main',
    commit: 'abc123def'
  },

  // === 环境变量 (合并后: global -> folder -> project -> environment) ===
  env: {
    NAMESPACE: 'ticatec',
    REGISTRY: 'registry.example.com',
    PORT: '3000',
    // ... 其他配置的变量
  },

  // === Omniflow 全局配置 ===
  omniflow: {
    env: { NAMESPACE: 'ticatec', ... },      // 全局变量
    git: { ... },                            // Git 配置
    ssh: {                                   // SSH 配置
      test: { server: 'test.com', user: 'deploy', port: 22 },
      prod: { server: 'prod.com', user: 'admin', port: 22 }
    }
  },

  // === 系统操作 ===
  actions: {
    log: {
      info(msg)      // 输出信息
      success(msg)   // 输出成功
      error(msg)     // 输出错误
      warn(msg)      // 输出警告
    },
    shell: {
      exec(cmd)      // 执行 shell 命令，返回 { stdout, stderr }
    },
    git: {
      clone(opts)    // 克隆 git 仓库
    }
  },

  // === 工具函数 ===
  utils: {
    // 获取 package.json 版本
    getPackageVersion({ workspace, subdir }),

    // 替换模板文件变量
    templateReplace({
      sourceFile: 'template.tpl',
      targetFile: 'output.txt',
      variables: { NAME: 'value', PORT: '3000' }
    }),

    // 格式化 docker-compose 环境变量
    formatDockerEnv({ env: { PORT: '3000' }, indent: '  ' }),

    // 合并 docker-compose 环境变量
    mergeDockerEnv({ envArrays: [['- PORT=3000'], ['- UID=1000']] })
  },

  // === 公共命令库 (来自配置仓库的 commands.js) ===
  commands: {
    // Node 应用构建
    getPackageVersion(workspace, subdir),
    buildNodeApp({ projectName, workDir, distDir, assetsDir }),

    // Docker 操作
    buildDockerImage({ projectName, version, dockerImage, ... }),
    pushDockerImage({ dockerImage, version }),

    // SSH/SCP 操作
    sshExec({ sshEnv, command, remoteDir }),
    scpUpload({ sshEnv, localPath, remotePath }),
    createRemoteDir({ sshEnv, remoteDir }),
    createDockerComposeContainer(ctx, { projectName, workDir, subdir, ... })
  },

  // === 系统别名 (向后兼容) ===
  system: {
    WORKSPACE: '/Users/xxx/.omniflow/project/xxx',
    WORKPLACE: '/Users/xxx/.omniflow/project/xxx',   // 同 WORKSPACE
    PROJECT_NAME: 'Platform Service',
    PACKAGE_VERSION: 'abc123'
  },

  // === 选项 ===
  verbose: true/false   // 是否详细输出
}
```

---

## 常用部署模式

### 模式 1: 构建 Node 应用 + Docker 镜像

```javascript
export default async function pipeline(ctx) {
  const { log } = ctx.actions;
  const { system } = ctx;

  const projectName = 'my-service';
  const workDir = system.WORKPLACE;
  const subdir = 'services/my-service';
  const namespace = ctx.omniflow.env.NAMESPACE || 'default';

  // 获取版本
  const version = ctx.commands.getPackageVersion(workDir, subdir);

  // 构建 Node 应用 tar.gz
  ctx.commands.buildNodeApp({
    projectName: projectName,
    workDir: `${workDir}/${subdir}`,
    distDir: 'dist',
    assetsDir: 'assets/docker'
  });

  // 构建 Docker 镜像
  await ctx.commands.buildDockerImage({
    projectName: projectName,
    version: version,
    dockerImage: `${namespace}/${projectName}`,
    baseImage: ctx.omniflow.env.BASE_IMAGE || 'node:18-alpine',
    workDir: `${workDir}/${subdir}`,
    assetsDir: 'assets/docker',
    outputDir: 'output'
  });

  await log.success(`Build complete: ${namespace}/${projectName}:${version}`);
}
```

### 模式 2: 部署到远程服务器 (Docker Compose)

```javascript
export default async function pipeline(ctx) {
  const { system, env } = ctx;

  await ctx.commands.createDockerComposeContainer(ctx, {
    projectName: 'my-service',
    workDir: system.WORKPLACE,
    subdir: 'services/my-service',
    sshEnv: ctx.environment.name,  // 使用当前环境名称 (test/prod)
    extraEnv: {
      NETWORK_NAME: env.NETWORK_NAME || 'default-network',
      PORT: env.PORT || '3000',
      NAMESPACE: env.NAMESPACE
    }
  });
}
```

### 模式 3: 多阶段部署 (构建 + 推送 + 部署)

```javascript
export default async function pipeline(ctx) {
  const { log } = ctx.actions;
  const { system, env } = ctx;

  const projectName = 'my-service';
  const namespace = ctx.omniflow.env.NAMESPACE || 'default';
  const version = ctx.commands.getPackageVersion(system.WORKPLACE);

  // Stage 1: 构建
  await log.info('Stage 1: Building...');
  ctx.commands.buildNodeApp({ /* ... */ });
  await ctx.commands.buildDockerImage({ /* ... */ });

  // Stage 2: 推送镜像
  await log.info('Stage 2: Pushing image...');
  await ctx.commands.pushDockerImage({
    dockerImage: `${namespace}/${projectName}`,
    version: version
  });

  // Stage 3: 部署
  await log.info('Stage 3: Deploying...');
  await ctx.commands.createDockerComposeContainer(ctx, { /* ... */ });

  await log.success('All stages complete!');
}
```

### 模式 4: 条件部署 (根据环境执行不同逻辑)

```javascript
export default async function pipeline(ctx) {
  const { log } = ctx.actions;
  const envName = ctx.environment.name;

  if (envName === 'prod') {
    // 生产环境：需要额外步骤
    await log.info('Running production checks...');
    await ctx.actions.shell.exec('npm run test');
  }

  // 所有环境都执行
  await log.info(`Deploying to ${envName}...`);
  // ... 部署逻辑
}
```

### 模式 5: 使用模板替换

```javascript
export default async function pipeline(ctx) {
  const { system } = ctx;

  // 替换配置文件中的变量
  await ctx.utils.templateReplace({
    sourceFile: './config/app.config.tpl',
    targetFile: './config/app.config',
    variables: {
      API_URL: ctx.env.API_URL,
      DB_HOST: ctx.env.DB_HOST,
      ENVIRONMENT: ctx.environment.name
    }
  });
}
```

---

## 使用公共命令库

公共命令库位于配置仓库的 `commands.js`，使用前先确认可用命令：

```javascript
// 查看可用命令 (运行时会打印)
console.log(Object.keys(ctx.commands));

// 调用命令
const result = await ctx.commands.commandName({ /* options */ });
```

### 常用公共命令

| 命令 | 说明 |
|------|------|
| `getPackageVersion(workspace, subdir)` | 获取 package.json 版本 |
| `buildNodeApp({ projectName, workDir, ... })` | 构建 Node 应用 tar.gz |
| `buildDockerImage({ projectName, version, dockerImage, ... })` | 构建 Docker 镜像 |
| `pushDockerImage({ dockerImage, version })` | 推送镜像到仓库 |
| `sshExec({ sshEnv, command, remoteDir })` | SSH 远程执行命令 |
| `scpUpload({ sshEnv, localPath, remotePath })` | SCP 上传文件 |
| `createDockerComposeContainer(ctx, { ... })` | Docker Compose 部署 |

---

## 错误处理

```javascript
export default async function pipeline(ctx) {
  const { log } = ctx.actions;

  try {
    // 部署逻辑
    await ctx.commands.buildDockerImage({ /* ... */ });
  } catch (error) {
    await log.error(`Build failed: ${error.message}`);
    throw error;  // 重新抛出以中止流程
  }
}
```

---

## 重要注意事项

1. **ctx 路径正确性**
   - ✅ `ctx.omniflow.env.NAMESPACE` - 正确
   - ❌ `ctx.config.omniflow.env.NAMESPACE` - 错误

2. **环境获取**
   - 环境名称: `ctx.environment.name`
   - 环境配置: `ctx.environment.config`
   - 合并变量: `ctx.env.VAR_NAME`

3. **工作目录**
   - 项目根目录: `ctx.projectRoot` 或 `ctx.system.WORKPLACE`
   - 子目录项目: 需要拼接路径

4. **SSH 配置**
   - 从环境变量: `ctx.environment.config.vars.ssh.test`
   - 或全局配置: `ctx.omniflow.ssh.test`

5. **异步操作**
   - 使用 `await` 调用异步函数
   - 公共命令库函数可能是同步或异步

---

## 快速检查清单

创建部署文件后，检查：

- [ ] 文件位置: `项目根目录/omniflow/deploy.js`
- [ ] 使用 ES 模块语法 (`export default`)
- [ ] ctx 属性引用正确 (无 `ctx.config`)
- [ ] 环境变量使用 `ctx.env.VAR_NAME`
- [ ] 全局配置使用 `ctx.omniflow.xxx`
- [ ] 异步操作使用 `await`
- [ ] 有适当的日志输出 (`log.info`, `log.success`)

---

## 完整示例

```javascript
/**
 * Omniflow Deploy Pipeline
 * 功能：构建 Node 应用并部署到远程服务器
 */

export default async function pipeline(ctx) {
  const { log } = ctx.actions;
  const { system, env } = ctx;

  // 项目配置
  const projectName = 'user-service';
  const workDir = system.WORKPLACE;
  const subdir = 'services/user';
  const namespace = ctx.omniflow.env.NAMESPACE || env.NAMESPACE || 'ticatec';
  const dockerImage = `${namespace}/${projectName}`;

  // 获取版本号
  const version = ctx.commands.getPackageVersion(workDir, subdir);

  await log.info(`🚀 Building ${projectName} version ${version} for ${ctx.environment.name}...`);

  // 构建 Node 应用
  await log.info('📦 Building Node application...');
  ctx.commands.buildNodeApp({
    projectName: projectName,
    workDir: `${workDir}/${subdir}`,
    distDir: 'dist',
    assetsDir: 'assets/docker'
  });

  // 构建 Docker 镜像
  await log.info('🐳 Building Docker image...');
  await ctx.commands.buildDockerImage({
    projectName: projectName,
    version: version,
    dockerImage: dockerImage,
    baseImage: ctx.omniflow.env.BASE_IMAGE || 'node:18-alpine',
    workDir: `${workDir}/${subdir}`,
    assetsDir: 'assets/docker',
    outputDir: 'output'
  });

  // 推送镜像
  await log.info('📤 Pushing Docker image...');
  await ctx.commands.pushDockerImage({
    dockerImage: dockerImage,
    version: version
  });

  // 部署到远程服务器
  await log.info('🚀 Deploying to remote server...');
  await ctx.commands.createDockerComposeContainer(ctx, {
    projectName: projectName,
    workDir: workDir,
    subdir: subdir,
    sshEnv: ctx.environment.name,
    extraEnv: {
      NETWORK_NAME: env.NETWORK_NAME || 'omni-network',
      PORT: env.PORT || '3000',
      NAMESPACE: namespace
    }
  });

  await log.success(`✅ Deployment complete: ${dockerImage}:${version}`);
}
```