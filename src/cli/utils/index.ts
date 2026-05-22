/**
 * Omniflow System Utilities
 * Utility functions available in deployment scripts via ctx.utils
 */

import path from 'path'
import {promises as fs} from 'fs'
import {$} from '../../core/shell.js'
import {tmpdir} from 'os'
import type {SshServerConfig} from '../../types/config.js'

/**
 * Get SSH configuration by key
 * @param key - SSH configuration key (e.g., 'test', 'prod')
 * @param sshConfig - SSH configurations object from ctx.sshConfig
 * @returns SSH server configuration or undefined if not found
 *
 * @example
 * ```ts
 * // In deployment script
 * const sshConfig = ctx.utils.getSshConfig('prod', ctx.sshConfig);
 * if (sshConfig) {
 *   console.log(`Server: ${sshConfig.server}`);
 *   console.log(`User: ${sshConfig.user}`);
 * }
 * ```
 */
export function getSshConfig(
    key: string,
    sshConfig?: Record<string, SshServerConfig>
): SshServerConfig | undefined {
    return sshConfig?.[key];
}

/**
 * Get all available SSH configuration keys
 * @param sshConfig - SSH configurations object from ctx.sshConfig
 * @returns Array of available SSH configuration keys
 *
 * @example
 * ```ts
 * const keys = ctx.utils.getSshConfigKeys(ctx.sshConfig);
 * console.log('Available SSH configs:', keys);
 * // Output: ['test', 'prod']
 * ```
 */
export function getSshConfigKeys(
    sshConfig?: Record<string, SshServerConfig>
): string[] {
    return sshConfig ? Object.keys(sshConfig) : [];
}

/**
 * Replace template variables in a file
 * @param opts.sourceFile - Source template file path
 * @param opts.targetFile - Target file path
 * @param opts.variables - Variables to replace, e.g. { PROJECT_NAME: 'my-app' }
 */
export async function templateReplace(opts: {
    sourceFile: string
    targetFile: string
    variables: Record<string, string>
}): Promise<void> {
    const {sourceFile, targetFile, variables} = opts

    // Read source file
    const content = await fs.readFile(sourceFile, 'utf-8')

    // Replace all ${VAR_NAME} with values
    let result = content
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\$\\{${key}\\}`, 'g')
        result = result.replace(regex, String(value))
    }

    // Write target file
    await fs.writeFile(targetFile, result, 'utf-8')
    console.log(`  ✓ Template: ${sourceFile} -> ${targetFile}`)
}

/**
 * Get version from package.json
 * @param packageDir - Directory containing package.json
 * @returns Version string
 */
export async function getPackageVersion(packageDir: string): Promise<string> {
    const packageJsonPath = path.join(packageDir, 'package.json')
    const content = await fs.readFile(packageJsonPath, 'utf-8')
    const packageJson = JSON.parse(content)
    return packageJson.version
}

/**
 * Format environment variables for docker-compose
 * Converts an object to YAML format with proper indentation
 * @param opts.env - Environment variables object, e.g. { UID: '1000', PORT: '3000' }
 * @param opts.indent - Indentation string (default: '  ' for two spaces)
 * @returns Formatted YAML string for docker-compose environment section
 *
 * @example
 * formatDockerEnv({ UID: '1000', GID: '1000' })
 * // Returns:
 * // '- UID=1000\n- GID=1000'
 */
export function formatDockerEnv(opts: {
    env: Record<string, string>
    indent?: string
}): string {
    const {env, indent = '  '} = opts

    const lines: string[] = []
    for (const [key, value] of Object.entries(env)) {
        lines.push(`${indent}- ${key}=${value}`)
    }
    return lines.join('\n')
}

/**
 * Merge and format docker environment variables
 * Merges multiple DOCKER_ENV arrays and formats them for docker-compose
 * @param opts.envArrays - Array of DOCKER_ENV arrays from config
 * @param opts.indent - Indentation string (default: '    ' for four spaces)
 * @returns Formatted YAML string for docker-compose environment section
 *
 * @example
 * mergeDockerEnv({
 *   envArrays: [
 *     ['- UID=${MY_UID}', '- GID=${MY_GID}'],  // from omniflow.env
 *     ['- CONFIG_FILE=omni/config.yaml']        // from command
 *   ]
 * })
 * // Returns:
 * // '    - UID=${MY_UID}\n    - GID=${MY_GID}\n    - CONFIG_FILE=omni/config.yaml'
 */
export function mergeDockerEnv(opts: {
    envArrays: (string[] | undefined)[]
    indent?: string
}): string {
    const {envArrays, indent = '    '} = opts

    // Merge all arrays, remove duplicates (first occurrence wins)
    const merged = new Map<string, string>()

    for (const arr of envArrays) {
        if (!arr) continue
        for (const item of arr) {
            // Parse "- KEY=VALUE" format
            const match = item.match(/^-\s*(.+?)=(.+)$/)
            if (match) {
                const [, key, value] = match
                if (!merged.has(key)) {
                    merged.set(key, value)
                }
            }
        }
    }

    // Format output
    const lines: string[] = []
    for (const [key, value] of merged.entries()) {
        lines.push(`${indent}- ${key}=${value}`)
    }
    return lines.join('\n')
}

/**
 * Create a tar archive (optionally compressed)
 * The archive will extract to a directory named after the filename
 *
 * @param opts.sourceDir - Directory to compress
 * @param opts.filename - Name for the archive (without extension), e.g., 'my-app-1.0.0'
 * @param opts.outputDir - Directory where the archive file will be stored
 * @param opts.zip - Whether to compress (true = tar.gz, false = tar only), default true
 * @returns Path to the created archive file
 *
 * @example
 * ```ts
 * // Create tar.gz (default)
 * const tarPath = await tar({
 *   sourceDir: '/path/to/dist',
 *   filename: 'my-app-1.0.0',
 *   outputDir: '/path/to/releases'
 * })
 * // Creates: /path/to/releases/my-app-1.0.0.tar.gz
 *
 * // Create tar only (no compression)
 * const tarPath = await tar({
 *   sourceDir: '/path/to/dist',
 *   filename: 'my-app-1.0.0',
 *   outputDir: '/path/to/releases',
 *   zip: false
 * })
 * // Creates: /path/to/releases/my-app-1.0.0.tar
 * ```
 */
export async function tar(opts: {
    sourceDir: string
    filename: string
    outputDir: string
    zip?: boolean
}): Promise<string> {
    const {sourceDir, filename, outputDir, zip = true} = opts

    // Ensure output directory exists
    await fs.mkdir(outputDir, {recursive: true})

    // Create a temp directory with the filename
    const tempBase = path.join(tmpdir(), `omniflow-tar-${Date.now()}`)
    const tempDir = path.join(tempBase, filename)

    // Create the temp structure
    await fs.mkdir(tempDir, {recursive: true})

    try {
        // Copy source directory contents to temp directory
        await fs.cp(sourceDir, tempDir, {recursive: true})

        // Determine extension and tar flags
        const ext = zip ? 'tar.gz' : 'tar'
        const flags = zip ? 'czf' : 'cf'
        const tempTarPath = path.join(tempBase, `${filename}.${ext}`)

        console.log(`  📦 Creating ${ext} archive...`)
        await $`cd ${tempBase} && tar -${flags} ${tempTarPath} ${filename}`

        // Get file stats
        const stats = await fs.stat(tempTarPath)
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2)
        console.log(`  ✓ Archive created: ${stats.size} bytes (${sizeMB} MB)`)

        // Move to final destination
        const finalPath = path.join(outputDir, `${filename}.${ext}`)
        await fs.rename(tempTarPath, finalPath)

        return finalPath
    } finally {
        // Clean up temp directory
        await fs.rm(tempBase, {recursive: true, force: true})
    }
}

/**
 * 工具函数集合
 */

/**
 * 格式化日期
 * @param {Date} date - 日期对象
 * @returns {string} ISO 格式日期字符串
 */
export function formatDate(date = new Date()) {
    return date.toISOString();
}

/**
 * 构建版本号
 * @param {string} prefix - 版本前缀
 * @returns {string} 版本号
 */
export function buildVersion(prefix = 'v'): string {
    return `${prefix}${Date.now()}`;
}

/**
 * 生成 UUID
 * @returns {string} UUID
 */
export function uuid(): string {
    return Math.random().toString(36).substring(2, 15);
}

/**
 * 延迟执行
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise}
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}