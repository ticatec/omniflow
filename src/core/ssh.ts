/**
 * SSH/SCP Remote Operations
 * Execute commands and copy files to remote servers via SSH
 *
 * @example
 * ```ts
 * import ssh from './ssh.js'
 *
 * // Execute remote command(s)
 * const result = await ssh.exec({
 *     user: 'deploy',
 *     privateKey: '-----BEGIN RSA PRIVATE KEY-----...',
 *     host: '192.168.1.100',
 *     command: 'ls -la',
 *     remoteDir: '/var/www'
 * })
 * console.log(result.stdout)
 *
 * // Copy file to remote
 * await ssh.scp({
 *     user: 'deploy',
 *     privateKeyFile: '/path/to/id_rsa',
 *     host: '192.168.1.100',
 *     localPath: './app.tar.gz',
 *     remotePath: '/var/www/'
 * })
 * ```
 */

import { $ } from './shell.js'
import * as fs from 'fs/promises'
import * as path from 'path'
import { tmpdir } from 'os'

/**
 * SSH authentication configuration
 * Supports three authentication methods: password, private key content, or private key file
 */
export interface SshAuthConfig {
    /** SSH login user */
    user: string
    /** SSH password (optional, requires sshpass or similar) */
    password?: string
    /** Private key content as string */
    privateKey?: string
    /** Path to private key file */
    privateKeyFile?: string
}

/**
 * Complete SSH connection configuration including authentication
 */
export interface SshConnectionConfig extends SshAuthConfig {
    /** Remote host (IP address or hostname) */
    host: string
    /** SSH port number (default: 22) */
    port?: number
}


/**
 * Copy file to remote via SCP
 *
 * @param sshConfig - SSH connection configuration
 * @param srcFile - Local source file path
 * @param targetFile - Remote target file path (including filename)
 *
 * @example
 * ```ts
 * await ssh.scpFile(
 *   { host: '192.168.1.100', user: 'deploy', privateKeyFile: '/path/to/key' },
 *   './app.tar.gz',
 *   '/var/www/releases/app.tar.gz'
 * )
 * ```
 */
async function scpFile(
    sshConfig: SshConnectionConfig,
    srcFile: string,
    targetFile: string
): Promise<void> {
    const { host, port } = sshConfig

    // Extract directory path from target file
    const targetDir = path.dirname(targetFile)

    console.log(`  📤 SCP: ${srcFile} -> ${sshConfig.user}@${host}:${port || 22}:${targetFile}`)

    // Create target directory if it doesn't exist
    console.log(`  📁 Ensuring remote directory exists: ${targetDir}`)
    await exec(sshConfig, `mkdir -p ${targetDir}`)

    // Copy file to remote
    const connStr = await buildScpConnection(sshConfig)
    const remoteDest = `${sshConfig.user}@${host}:${targetFile}`

    await $`scp ${connStr} ${srcFile} ${remoteDest}`
    console.log(`  ✓ Copy complete`)
}

/**
 * Create a temporary SSH key file from key content
 * The file is created with secure permissions (0600)
 *
 * @param keyContent - The private key content as a string
 * @returns Path to the temporary key file
 *
 * @example
 * ```ts
 * const keyFile = await createTempKeyFile('-----BEGIN RSA PRIVATE KEY-----...')
 * // Returns: /tmp/ssh-key-1234567890/id_rsa
 * ```
 */
async function createTempKeyFile(keyContent: string): Promise<string> {
    const tempDir = path.join(tmpdir(), `ssh-key-${Date.now()}`)
    await fs.mkdir(tempDir, { recursive: true })
    const keyFile = path.join(tempDir, 'id_rsa')
    await fs.writeFile(keyFile, keyContent, { mode: 0o600 })
    return keyFile
}

/**
 * Build SSH command-line options for authentication
 *
 * @param auth - SSH authentication configuration
 * @returns SSH options string (e.g., "-i /path/to/key")
 *
 * @example
 * ```ts
 * const opts = await buildSshOptions({ user: 'deploy', privateKey: '...' })
 * // Returns: "-i /tmp/ssh-key-1234567890/id_rsa"
 * ```
 */
async function buildSshOptions(auth: SshAuthConfig): Promise<string> {
    const options: string[] = []

    if (auth.privateKey) {
        const keyFile = await createTempKeyFile(auth.privateKey)
        options.push(`-i ${keyFile}`)
    } else if (auth.privateKeyFile) {
        options.push(`-i ${auth.privateKeyFile}`)
    }

    return options.join(' ')
}

/**
 * Build SSH connection string for ssh command
 *
 * @param config - SSH connection configuration
 * @returns SSH connection arguments
 *
 * @example
 * ```ts
 * const connStr = await buildSshConnection({ user: 'deploy', host: '192.168.1.100', port: 22 })
 * // Returns: "-p 22 deploy@192.168.1.100"
 * ```
 */
async function buildSshConnection(config: SshConnectionConfig): Promise<string> {
    const port = config.port || 22
    const authOptions = await buildSshOptions(config)
    return `-p ${port} ${authOptions} ${config.user}@${config.host}`
}

/**
 * Build SCP connection string for scp command
 *
 * @param config - SSH connection configuration
 * @returns SCP connection arguments
 *
 * @example
 * ```ts
 * const connStr = await buildScpConnection({ user: 'deploy', host: '192.168.1.100', port: 22 })
 * // Returns: "-P 22 -i /path/to/key"
 * ```
 */
async function buildScpConnection(config: SshConnectionConfig): Promise<string> {
    const port = config.port || 22
    const authOptions = await buildSshOptions(config)
    return `-P ${port} ${authOptions}`
}

/**
 * Execute command(s) on remote server via SSH
 *
 * @param sshConfig - SSH connection configuration
 * @param command - Command(s) to execute (single line or multi-line string)
 * @param remoteDir - Optional remote working directory
 * @returns Result containing stdout, stderr, and exit code
 *
 * @example
 * ```ts
 * // Single command
 * const result = await ssh.exec(
 *   { host: '192.168.1.100', user: 'deploy', privateKeyFile: '/path/to/key' },
 *   'ls -la'
 * )
 *
 * // With remote directory
 * const result = await ssh.exec(
 *   { host: '192.168.1.100', user: 'deploy', privateKeyFile: '/path/to/key' },
 *   'pwd',
 *   '/var/www'
 * )
 *
 * console.log(result.stdout)
 * console.log(result.stderr)
 * console.log(result.exitCode)
 * ```
 */
async function exec(
    sshConfig: SshConnectionConfig,
    command: string,
    remoteDir?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const { host, port } = sshConfig

    console.log(`  🔧 SSH Exec: ${sshConfig.user}@${host}:${port || 22}`)
    if (remoteDir) {
        console.log(`     Dir: ${remoteDir}`)
    }

    const connStr = await buildSshConnection(sshConfig)
    const fullCommand = remoteDir
        ? `ssh ${connStr} "cd ${remoteDir} && ${command}"`
        : `ssh ${connStr} "${command}"`

    try {
        const result = await $`${fullCommand}`
        return {
            stdout: result.stdout.trim(),
            stderr: result.stderr.trim(),
            exitCode: 0
        }
    } catch (error: any) {
        return {
            stdout: error.stdout?.trim() || '',
            stderr: error.stderr?.trim() || error.message,
            exitCode: error.exitCode || 1
        }
    }
}

export default {
    exec,
    scpFile
}