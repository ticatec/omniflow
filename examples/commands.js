/**
 * Omniflow 公共命令库示例，用于
 *
 * 此文件定义了可被所有项目 pipeline 使用的公共命令
 * 位置：配置仓库根目录 (与 omniflow.yaml 同级)
 *
 * 使用方式：
 *   export default async function pipeline(ctx) {
 *     await ctx.commands.sshExec({ ... })
 *     await ctx.commands.remoteDeploy({ ... })
 *   }
 */

import { $ } from 'zx'

/**
 * SSH 远程执行命令
 *
 * @param options - 配置选项
 * @param options.host - 主机地址（IP 或域名）
 * @param options.user - SSH 用户名
 * @param options.command - 要执行的命令（支持多行字符串）
 * @param options.env - 环境变量对象
 * @param options.port - SSH 端口（默认 22）
 *
 * @example
 * await sshExec({
 *   host: '192.168.1.5',
 *   user: 'deploy',
 *   command: `
 *     cd /opt/app
 *     npm install
 *     npm run build
 *   `
 * })
 */
export async function sshExec({ host, user, command, env = {}, port = 22 }) {
  // 构建环境变量导出语句
  const envStr = Object.entries(env)
    .map(([k, v]) => `export ${k}="${v}"`)
    .join(' ')

  // 构建完整的 SSH 命令
  const fullCommand = envStr ? `${envStr}; ${command}` : command

  const sshCmd = `ssh -o StrictHostKeyChecking=no -p ${port} ${user}@${host} "${fullCommand.replace(/"/g, '\\"')}"`

  try {
    const result = await $`sh -c ${sshCmd}`
    return {
      success: true,
      stdout: result.stdout,
      stderr: result.stderr
    }
  } catch (error) {
    return {
      success: false,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      error: error.message
    }
  }
}

/**
 * 远程部署（封装 sshExec，提供更简洁的接口）
 *
 * @param options - 配置选项
 * @param options.host - 主机地址
 * @param options.user - 用户名
 * @param options.remotePath - 远程工作目录
 * @param options.commands - 命令数组或多行字符串
 * @param options.env - 环境变量
 *
 * @example - 使用数组
 * await remoteDeploy({
 *   host: '192.168.1.5',
 *   user: 'deploy',
 *   remotePath: '/opt/app',
 *   commands: ['npm install', 'npm run build', 'pm2 restart app']
 * })
 *
 * @example - 使用多行字符串
 * await remoteDeploy({
 *   host: '192.168.1.5',
 *   user: 'deploy',
 *   remotePath: '/opt/app',
 *   commands: `
 *     npm install
 *     npm run build
 *     pm2 restart app
 *   `
 * })
 */
export async function remoteDeploy({ host, user, remotePath, commands, env = {} }) {
  // 将命令转换为字符串
  const cmdStr = Array.isArray(commands)
    ? commands.join(' && ')
    : commands

  // 构建完整的部署命令
  const fullCommand = `
    cd ${remotePath}
    ${cmdStr}
  `

  return await sshExec({ host, user, command: fullCommand.trim(), env })
}

/**
 * Docker 容器部署
 *
 * @param options - 配置选项
 * @param options.image - Docker 镜像名
 * @param options.container - 容器名称
 * @param options.host - 目标主机（可选，本地部署不传）
 * @param options.user - SSH 用户（远程部署需要）
 * @param options.env - 环境变量
 * @param options.ports - 端口映射数组 ['8080:80', '3000:3000']
 * @param options.restart - 重启策略（默认 'always'）
 *
 * @example - 本地部署
 * await dockerDeploy({
 *   image: 'myapp:latest',
 *   container: 'myapp',
 *   env: { NODE_ENV: 'production' },
 *   ports: ['8080:80']
 * })
 *
 * @example - 远程部署
 * await dockerDeploy({
 *   image: 'myapp:latest',
 *   container: 'myapp',
 *   host: '192.168.1.5',
 *   user: 'deploy',
 *   env: { NODE_ENV: 'production' }
 * })
 */
export async function dockerDeploy({
  image,
  container,
  host,
  user,
  env = {},
  ports = [],
  restart = 'always'
}) {
  // 构建环境变量参数
  const envArgs = Object.entries(env)
    .map(([k, v]) => `-e ${k}=${v}`)
    .join(' ')

  // 构建端口映射参数
  const portArgs = ports.map(p => `-p ${p}`).join(' ')

  // 停止并删除旧容器
  const stopCmd = `
    docker stop ${container} || true
    docker rm ${container} || true
  `

  // 启动新容器
  const runCmd = `
    docker run -d \
      --name ${container} \
      --restart ${restart} \
      ${envArgs} \
      ${portArgs} \
      ${image}
  `

  if (host && user) {
    // 远程部署
    await sshExec({
      host,
      user,
      command: (stopCmd + runCmd).trim()
    })
  } else {
    // 本地部署
    await $`${stopCmd}`
    await $`${runCmd}`
  }
}

/**
 * 构建 Docker 镜像
 *
 * @param options - 配置选项
 * @param options.context - 构建上下文路径（默认 '.'）
 * @param options.dockerfile - Dockerfile 路径（默认 'Dockerfile'）
 * @param options.tags - 镜像标签数组
 * @param options.buildArgs - 构建参数
 * @param options.host - 目标主机（可选）
 * @param options.user - SSH 用户（远程构建需要）
 *
 * @example
 * await dockerBuild({
 *   context: '.',
 *   tags: ['myapp:latest', 'myapp:v1.0.0'],
 *   buildArgs: { NODE_VERSION: '18' }
 * })
 */
export async function dockerBuild({
  context = '.',
  dockerfile = 'Dockerfile',
  tags = [],
  buildArgs = {},
  host,
  user
}) {
  const tagArgs = tags.map(t => `-t ${t}`).join(' ')
  const buildArgArgs = Object.entries(buildArgs)
    .map(([k, v]) => `--build-arg ${k}=${v}`)
    .join(' ')

  const buildCmd = `docker build -f ${dockerfile} ${tagArgs} ${buildArgArgs} ${context}`

  if (host && user) {
    return await sshExec({ host, user, command: buildCmd })
  } else {
    try {
      const result = await $`${buildCmd}`
      return { success: true, stdout: result.stdout }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
}

/**
 * 工具函数集合
 */
export const utils = {
  /** 格式化日期为 ISO 字符串 */
  formatDate: (date = new Date()) => date.toISOString(),

  /** 生成时间戳版本号 */
  buildVersion: (prefix = 'v') => `${prefix}${Date.now()}`,

  /** 生成短 UUID */
  uuid: () => Math.random().toString(36).substring(2, 15),

  /** 延迟执行 */
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  /** 解析 Git URL */
  parseGitUrl: (url) => {
    try {
      let cleanUrl = url
      if (url.startsWith('git@')) {
        cleanUrl = url.replace(':', '/').replace('git@', 'https://')
      }
      const urlObj = new URL(cleanUrl)
      const pathParts = urlObj.pathname.split('/').filter(p => p)
      return {
        platform: urlObj.hostname,
        owner: pathParts[pathParts.length - 2],
        repo: pathParts[pathParts.length - 1].replace(/\.git$/, '')
      }
    } catch {
      return null
    }
  }
}

/**
 * 默认导出 - 包含所有命令的对象
 * 可以通过解构使用：const { sshExec, remoteDeploy, utils } = ctx.commands
 */
export default {
  sshExec,
  remoteDeploy,
  dockerDeploy,
  dockerBuild,
  utils
}