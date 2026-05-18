// 部署脚本示例
//
// 配置层次：
//   omniflow.env (全局) -> folder.vars (分组) -> project.vars (项目) -> environments[].vars (环境)
//
// 使用方式:
//   omniflow run omni-gate/platform test frontend-deploy

export default async function pipeline(ctx) {
  const { commands, env, project, environment, git, command } = ctx

  // 显示部署信息
  console.log(`=== Deploying ${project.name} to ${environment.name} ===`)
  console.log(`Workspace: ${env.WORKSPACE}`)
  console.log(`Branch: ${git.branch}`)
  console.log(`Commit: ${git.commit}`)
  if (command) {
    console.log(`Command: ${command.name}`)
  }

  // ============ 方式一：使用 sshExec 直接执行远程命令 ============
  /*
  await commands.sshExec({
    host: '192.168.1.5',
    user: 'deploy',
    command: `
      export NODE_PATH=/usr/local/node
      cd ${env.WORKSPACE}
      npm install
      npm run build
    `,
    env: {
      NODE_ENV: environment.name,
      API_URL: env.API_URL
    }
  })
  */

  // ============ 方式二：使用 remoteDeploy（推荐） ============
  /*
  await commands.remoteDeploy({
    host: env.DEPLOY_HOST || '192.168.1.5',
    user: env.DEPLOY_USER || 'deploy',
    remotePath: env.REMOTE_PATH || '/opt/app',
    command: `
      npm install
      npm run build
      pm2 restart app
    `,
    env: {
      NODE_ENV: environment.name,
      VERSION: git.commit
    }
  })
  */

  // ============ 方式三：Docker 部署 ============
  /*
  const version = commands.utils.buildVersion('v')
  const imageName = `${env.REGISTRY}/${project.key}:${version}`

  // 构建镜像
  await commands.dockerBuild({
    context: env.WORKSPACE,
    tags: [imageName, `${env.REGISTRY}/${project.key}:latest`],
    buildArgs: {
      NODE_VERSION: '18'
    }
  })

  // 推送镜像（如果需要）
  // await $`docker push ${imageName}`

  // 部署容器（本地）
  await commands.dockerDeploy({
    image: imageName,
    container: project.key.replace(/\//g, '-'),
    env: {
      NODE_ENV: environment.name,
      VERSION: version
    },
    ports: ['8080:80']
  })

  // 或者部署到远程服务器
  await commands.dockerDeploy({
    image: imageName,
    container: project.key.replace(/\//g, '-'),
    host: env.DEPLOY_HOST,
    user: env.DEPLOY_USER,
    env: {
      NODE_ENV: environment.name
    }
  })
  */

  // ============ 本地 shell 执行示例 ============
  const { $ } = await import('zx')

  await $`
    set -e

    echo "=== 进入工作目录 ==="
    cd ${env.WORKSPACE}

    echo "=== 安装依赖 ==="
    npm install

    echo "=== 运行测试 ==="
    npm test

    echo "=== 构建项目 ==="
    npm run build

    echo "=== 构建完成 ==="
  `

  console.log(`\n✅ Deployment to ${environment.name} complete!`)
}