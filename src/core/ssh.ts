/**
 * SSH/SCP Remote Operations
 * Execute commands and copy files to remote servers via SSH
 *
 * @example
 * ```ts
 * import ssh from './ssh.js'
 *
 * // Set SSH config map first
 * ssh.setSshConfigMap({
 *   'my-server': {
 *     server: '192.168.1.100',
 *     user: 'deploy',
 *     private_key_file: '/path/to/id_rsa',
 *     port: 22
 *   }
 * })
 *
 * // Execute remote command(s) using key
 * const result = await ssh.exec('my-server', 'ls -la', '/var/www')
 * console.log(result.stdout)
 *
 * // Copy file to remote using key
 * await ssh.cp('my-server', './app.tar.gz', '/var/www/')
 * ```
 */

import { $ } from './shell.js'
import * as fs from 'fs/promises'
import * as path from 'path'
import { tmpdir } from 'os'

/**
 * SSH server config from omniflow config
 */
export interface SshServerConfig {
    server: string
    user: string
    private_key_file?: string
    port?: number
}

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

// SSH config storage
let sshConfigMap: Record<string, SshServerConfig> = {}

/**
 * Set SSH configuration map
 * @param config - SSH configuration map from omniflow config
 */
export function setSshConfigMap(config: Record<string, SshServerConfig> | undefined): void {
    sshConfigMap = config || {}
}

/**
 * Get SSH connection config by key
 * Converts SshServerConfig to SshConnectionConfig
 * @param key - SSH server key
 * @returns SSH connection configuration
 * @throws Error if key not found
 */
function getSshConnectionConfig(key: string): SshConnectionConfig {
    const config = sshConfigMap[key]
    if (!config) {
        throw new Error(`SSH config not found for key: ${key}`)
    }
    return {
        host: config.server,
        user: config.user,
        privateKeyFile: config.private_key_file,
        port: config.port
    }
}


/**
 * Copy file to remote via SCP
 *
 * @param sshKey - SSH server key from config
 * @param srcFile - Local source file path (full path with filename)
 * @param targetFolder - Remote target folder path
 *
 * @example
 * ```ts
 * await ssh.cp(
 *   'my-server',
 *   './releases/app.tar.gz',
 *   '/var/www/releases'
 * )
 * // Result: ./releases/app.tar.gz -> deploy@192.168.1.100:/var/www/releases/app.tar.gz
 * ```
 */
async function cp(sshKey: string, srcFile: string, targetFolder: string): Promise<void> {
    const sshConfig = getSshConnectionConfig(sshKey)
    const { host, port } = sshConfig

    console.log(`  📤 SCP: ${srcFile} -> ${sshConfig.user}@${host}:${port || 22}:${targetFolder}/`)

    // Create target directory if it doesn't exist
    console.log(`  📁 Ensuring remote directory exists: ${targetFolder}`)
    await exec(sshKey, `mkdir -p ${targetFolder}`)

    // Build SCP command as string for bash -c
    let keyFileArg = ''
    if (sshConfig.privateKeyFile) {
        keyFileArg = `-i ${sshConfig.privateKeyFile}`
    } else if (sshConfig.privateKey) {
        const keyFile = await createTempKeyFile(sshConfig.privateKey)
        keyFileArg = `-i ${keyFile}`
    }

    const remoteDest = `${sshConfig.user}@${host}:${targetFolder}/`
    const scpCmd = `scp -o StrictHostKeyChecking=accept-new -P ${port || 22} ${keyFileArg} ${srcFile} ${remoteDest}`

    await $`bash -c ${scpCmd}`
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
 * Execute command(s) on remote server via SSH
 *
 * @param sshKey - SSH server key from config
 * @param command - Command(s) to execute (single line or multi-line string)
 * @param remoteDir - Optional remote working directory
 * @returns Result containing stdout, stderr, and exit code
 *
 * @example
 * ```ts
 * // Single command
 * const result = await ssh.exec('my-server', 'ls -la')
 *
 * // With remote directory
 * const result = await ssh.exec('my-server', 'pwd', '/var/www')
 *
 * console.log(result.stdout)
 * console.log(result.stderr)
 * console.log(result.exitCode)
 * ```
 */
async function exec(
    sshKey: string,
    command: string,
    remoteDir?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const sshConfig = getSshConnectionConfig(sshKey)
    const { host, port } = sshConfig

    console.log(`  🔧 SSH Exec: ${sshConfig.user}@${host}:${port || 22}`)
    if (remoteDir) {
        console.log(`     Dir: ${remoteDir}`)
    }

    // Build SSH arguments
    const args = [
        'ssh',
        '-o', 'StrictHostKeyChecking=accept-new',
        '-p', String(port || 22)
    ]

    // Add identity file if using private key auth
    if (sshConfig.privateKeyFile) {
        args.push('-i', sshConfig.privateKeyFile)
    } else if (sshConfig.privateKey) {
        const keyFile = await createTempKeyFile(sshConfig.privateKey)
        args.push('-i', keyFile)
    }

    // Add host and command
    const hostStr = `${sshConfig.user}@${host}`

    // Build the remote command with optional directory change
    let remoteCmd = command
    if (remoteDir) {
        remoteCmd = `cd ${remoteDir} || exit 1\n${command}`
    }

    // Use bash -c with heredoc for proper command handling
    const sshCommand = `ssh ${args.slice(1).join(' ')} ${hostStr} << 'EOF'\n${remoteCmd}\nEOF`

    try {
        const result = await $`bash -c ${sshCommand}`
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
    cp,
    setSshConfigMap
}