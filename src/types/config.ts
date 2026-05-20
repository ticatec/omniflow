// Omniflow configuration types

export interface OmniflowConfig {
  omniflow: OmniflowGlobal
  projects: ProjectItem[]
}

export interface OmniflowGlobal {
  env?: Record<string, string>
  git?: GitGlobalConfig
  ssh?: Record<string, SshServerConfig>
}

export interface GitGlobalConfig {
  repos: string
  username?: string
  password?: string
  default_branch?: string
}

export interface SshServerConfig {
  server: string
  user: string
  private_key_file?: string
  port?: number
}

// 项目项（可以是文件夹或具体项目）
export interface ProjectItem {
  name: string
  description?: string
  type?: 'folder' | 'project'

  // Folder 类型属性
  items?: ProjectItem[]           // folder 的子项

  // Project 类型属性
  repos?: GitProjectConfig        // 项目的仓库配置（仅 project）
  environments?: EnvironmentConfig[]  // 环境配置（仅 project）
  commands?: CommandDefinition[]  // 可执行的命令列表（仅 project，所有环境共享）

  // 通用属性（folder 和 project 都可以定义）
  vars?: Record<string, string>   // 变量（folder 的变量会被子项继承）
}

// Git仓库配置
export interface GitProjectConfig {
  git: string                       // 仓库地址，支持全局变量
  branch?: string                   // 默认分支
  username?: string
  password?: string
  depth?: number
  merge_strategy?: string           // MR/PR 策略: 'github', 'gitlab', 'forgejo'（可选，默认使用 GIT_MERGE_STRATEGY 环境变量）
}

// 项目定义（仅 project 类型）
export type ProjectDefinition = Omit<ProjectItem, 'items'> & {
  repos: GitProjectConfig
  environments?: EnvironmentConfig[]
}

// 环境配置
export interface EnvironmentConfig {
  name: string                      // 环境名称，如 test、prod
  description?: string              // 环境描述
  branch: string                    // Git 分支名
  merge_from?: string               // 合并来源分支
  vars?: Record<string, string>     // 环境变量
}

// 命令定义
export interface CommandDefinition {
  name: string                      // 命令名称（如 frontend-deploy）
  description?: string              // 命令描述
  script?: string                   // 脚本文件路径（相对于项目根目录，如 ./modules/frontend-deploy.js）
}

// 项目树节点（用于遍历）
export interface ProjectNode {
  name: string
  description?: string
  type: 'folder' | 'project'
  path: string[]           // 从根到当前节点的路径
  children?: ProjectNode[]
  config?: ProjectItem    // 对于 project 类型，这是配置
}
