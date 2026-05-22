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
 * @param srcFile - Local source file path (full path with filename)
 * @param targetFolder - Remote target folder path
 *
 * @example
 * ```ts
 * await ssh.cp(
 *   { host: '192.168.1.100', user: 'deploy', privateKeyFile: '/path/to/key' },
 *   './releases/app.tar.gz',
 *   '/var/www/releases'
 * )
 * // Result: ./releases/app.tar.gz -> deploy@192.168.1.100:/var/www/releases/app.tar.gz
 * ```
 */
async function cp(
    sshConfig: SshConnectionConfig,
    srcFile: string,
    targetFolder: string
): Promise<void> {
    const { host, port } = sshConfig
    const filename = path.basename(srcFile)

    console.log(`  📤 SCP: ${srcFile} -> ${sshConfig.user}@${host}:${port || 22}:${targetFolder}/`)

    // Create target directory if it doesn't exist
    console.log(`  📁 Ensuring remote directory exists: ${targetFolder}`)
    await exec(sshConfig, `mkdir -p ${targetFolder}`)

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
    cp
}