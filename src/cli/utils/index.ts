/**
 * Omniflow System Utilities
 * Utility functions available in deployment scripts via ctx.utils
 */

import path from 'path'
import {promises as fs} from 'fs'
import {$} from '../../core/shell.js'
import {tmpdir} from 'os'
import {platform} from 'os'

/**
 * Format template file by replacing {{key}} placeholders
 * Uses {{key}} syntax to distinguish from shell environment variables ${var}
 * Supports nested object access via dot notation: {{docker.io}}
 * Undefined keys are replaced with empty string
 * @param opts.sourceFile - Source template file path
 * @param opts.targetFile - Target file path
 * @param opts.variables - Variables to replace, can include nested objects
 *
 * @example
 * // Template file contains: {{PROJECT_NAME}}-{{VERSION}}
 * formatTemplateFile({
 *   sourceFile: './template.txt',
 *   targetFile: './output.txt',
 *   variables: { PROJECT_NAME: 'my-app', VERSION: '1.0.0' }
 * })
 * // Result: my-app-1.0.0
 *
 * // Nested object access:
 * formatTemplateFile({
 *   sourceFile: './Dockerfile.tpl',
 *   targetFile: './Dockerfile',
 *   variables: {
 *     docker: { io: 'registry.cn-zhangjiakou.aliyuncs.com', namespace: 'myapp' }
 *   }
 * })
 * // Template: FROM {{docker.io}}/{{docker.namespace}}/{{app}}
 * // Result: FROM registry.cn-zhangjiakou.aliyuncs.com/myapp/app
 *
 * // If key is not defined: xxxx{{suffix}} -> xxxx
 */
export function formatTemplate(content: string, variables: Record<string, any>): string {
    // Helper function to get value from nested object using dot notation
    const getValue = (obj: any, path: string): string => {
        const keys = path.split('.')
        let current = obj
        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key]
            } else {
                return ''
            }
        }
        return String(current ?? '')
    }

    // Replace all {{key.path}} with values
    return content.replace(/\{\{([^}]+)\}\}/g, (match, keyPath) => {
        return getValue(variables, keyPath.trim())
    })
}

/**
 * Format template file by replacing {{key}} placeholders
 * Reads file, formats content, and writes result
 * @param opts.sourceFile - Source template file path
 * @param opts.targetFile - Target file path
 * @param opts.variables - Variables to replace, can include nested objects
 */
export async function formatTemplateFile(opts: {
    sourceFile: string
    targetFile: string
    variables: Record<string, any>
}): Promise<void> {
    const {sourceFile, targetFile, variables} = opts

    // Read source file
    const content = await fs.readFile(sourceFile, 'utf-8')

    // Format content
    const result = formatTemplate(content, variables)

    // Write target file
    await fs.writeFile(targetFile, result, 'utf-8')
    console.log(`  ✓ Template: ${sourceFile} -> ${targetFile}`)
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
 * Supports both array format ['- KEY=VALUE', ...] and object format {KEY: VALUE, ...}
 * Merges multiple sources and formats them for docker-compose
 * @param opts.envInputs - Array of env inputs (arrays, objects, or undefined)
 * @param opts.indent - Indentation string (default: '    ' for four spaces)
 * @returns Formatted YAML string for docker-compose environment section
 *
 * @example
 * mergeComposeEnv({
 *   envInputs: [
 *     ['- UID=${MY_UID}', '- GID=${MY_GID}'],  // array format
 *     {CONFIG_MODE: 'consul', CONSUL_PORT: '8500'}  // object format
 *   ]
 * })
 * // Returns:
 * // '    - UID=${MY_UID}\n    - GID=${MY_GID}\n    - CONFIG_MODE=consul\n    - CONSUL_PORT=8500'
 */
export function mergeComposeEnv(opts: {
    envInputs: (string[] | Record<string, string> | undefined)[]
    indent?: string
}): string {
    const {envInputs, indent = '    '} = opts
    const merged = new Map<string, string>()

    for (const input of envInputs) {
        if (!input) continue

        if (Array.isArray(input)) {
            // Handle array format: ['- KEY=VALUE', ...]
            for (const item of input) {
                const match = item.match(/^-\s*(.+?)=(.+)$/)
                if (match) {
                    const [, key, value] = match
                    if (!merged.has(key)) {
                        merged.set(key, value)
                    }
                }
            }
        } else if (typeof input === 'object') {
            // Handle object format: {KEY: VALUE, ...}
            for (const [key, value] of Object.entries(input)) {
                if (!merged.has(key)) {
                    merged.set(key, String(value))
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
        // Copy source directory contents to temp directory (not the directory itself)
        // Use /. to ensure we copy contents, and ensure tempDir exists
        // Set COPYFILE_DISABLE to avoid macOS extended attributes
        const originalEnv = $.env
        $.env = {...process.env, COPYFILE_DISABLE: '1'}
        await $`cp -R ${sourceDir}/. ${tempDir}/`
        $.env = originalEnv

        // Determine extension and tar flags
        const ext = zip ? 'tar.gz' : 'tar'
        const flags = zip ? 'czf' : 'cf'
        const tempTarPath = path.join(tempBase, `${filename}.${ext}`)

        console.log(`  📦 Creating ${ext} archive...`)
        // On macOS, use --no-mac-metadata to avoid extended header keywords
        const macOption = platform() === 'darwin' ? '--no-mac-metadata' : ''
        await $`cd ${tempBase} && tar ${macOption} -${flags} ${tempTarPath} ${filename}`

        // Get file stats
        const stats = await fs.stat(tempTarPath)
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2)
        console.log(`  ✓ Archive created: ${stats.size} bytes (${sizeMB} MB)`)

        // Move to final destination (copy + delete for cross-device support)
        const finalPath = path.join(outputDir, `${filename}.${ext}`)
        await fs.copyFile(tempTarPath, finalPath)
        await fs.unlink(tempTarPath)

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