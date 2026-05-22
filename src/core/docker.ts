/**
 * Docker Compose Operations
 * Create and manage containers via docker-compose
 * Supports both local and remote execution
 *
 * @example
 * ```ts
 * import docker from './core/docker'
 *
 * // Local docker-compose
 * await docker.compose(
 *   '/path/to/project',
 *   './docker-compose.yml',
 *   'up -d'
 * )
 *
 * // Remote docker-compose
 * await docker.composeOnRemote(
 *   { host: '192.168.1.100', user: 'deploy', privateKeyFile: '/path/to/key' },
 *   '/opt/app',
 *   './docker-compose.yml',
 *   'up -d',
 *   'mkdir -p /opt/data'  // pre-command
 * )
 * ```
 */

import * as path from 'path';
import {promises as fs} from 'fs';
import {$} from './shell.js';
import ssh, {type SshConnectionConfig} from './ssh.js';

/**
 * Create docker-compose containers locally
 *
 * @param workDir - Working directory for docker-compose
 * @param tplFile - Path to docker-compose template file
 * @param commands - Optional docker-compose commands (default: 'up -d')
 * @param preCommands - Optional commands to run before docker-compose
 *
 * @example
 * ```ts
 * await docker.compose(
 *   '/path/to/project',
 *   './docker-compose.yml',
 *   'up -d --build'
 * )
 *
 * // With pre-commands
 * await docker.compose(
 *   '/path/to/project',
 *   './docker-compose.yml',
 *   'up -d',
 *   'mkdir -p ./data && chmod 777 ./data'
 * )
 * ```
 */
async function compose(
    workDir: string,
    tplFile: string,
    commands: string = 'up -d',
    preCommands?: string
): Promise<void> {
    console.log(`  🐳 Local Docker Compose`);
    console.log(`     WorkDir: ${workDir}`);
    console.log(`     Template: ${tplFile}`);

    // Verify workDir exists
    try {
        await fs.access(workDir);
    } catch {
        throw new Error(`Working directory does not exist: ${workDir}`);
    }

    // Verify template file exists
    try {
        await fs.access(tplFile);
    } catch {
        throw new Error(`Template file does not exist: ${tplFile}`);
    }

    const filename = path.basename(tplFile);
    const targetTplPath = path.join(workDir, filename);

    // Copy template to workDir if different
    if (tplFile !== targetTplPath) {
        await fs.copyFile(tplFile, targetTplPath);
    }

    // Execute pre-commands if provided
    if (preCommands) {
        console.log(`  🔧 Running pre-commands...`);
        try {
            await $`cd ${workDir} && ${preCommands}`;
            console.log(`  ✓ Pre-commands completed`);
        } catch (error: any) {
            throw new Error(`Pre-commands failed: ${error.message}`);
        }
    }

    // Execute docker-compose
    console.log(`  🚀 Starting docker-compose...`);
    try {
        const composeCmd = `docker-compose -f ${targetTplPath} ${commands}`;
        await $`cd ${workDir} && ${composeCmd}`;
        console.log(`  ✓ Docker compose completed`);
    } catch (error: any) {
        throw new Error(`Docker compose failed: ${error.message}`);
    }
}

/**
 * Create docker-compose containers on remote server
 *
 * Steps:
 * 1. Copy template file to remote (creates directory if needed)
 * 2. Execute pre-commands if provided
 * 3. Execute docker-compose commands
 *
 * @param sshConfig - SSH connection configuration
 * @param targetDir - Target directory on remote server
 * @param tplFile - Path to local docker-compose template file
 * @param commands - Optional docker-compose commands (default: 'up -d')
 * @param preCommands - Optional commands to run before docker-compose
 *
 * @example
 * ```ts
 * await docker.composeOnRemote(
 *   { host: '192.168.1.100', user: 'deploy', privateKeyFile: '/path/to/key' },
 *   '/opt/myapp',
 *   './docker-compose.yml',
 *   'up -d --build'
 * )
 *
 * // With pre-commands
 * await docker.composeOnRemote(
 *   { host: '192.168.1.100', user: 'deploy', privateKeyFile: '/path/to/key' },
 *   '/opt/myapp',
 *   './docker-compose.yml',
 *   'up -d',
 *   'mkdir -p /opt/data && chmod 777 /opt/data'
 * )
 * ```
 */
async function composeOnRemote(
    sshConfig: SshConnectionConfig,
    targetDir: string,
    tplFile: string,
    commands: string = 'up -d',
    preCommands?: string
): Promise<void> {
    console.log(`  🐳 Remote Docker Compose: ${sshConfig.user}@${sshConfig.host}:${sshConfig.port || 22}`);
    console.log(`     Target: ${targetDir}`);
    console.log(`     Template: ${tplFile}`);

    // 1. Copy template file to remote (creates directory if needed)
    await ssh.cp(sshConfig, tplFile, targetDir);

    // 2. Execute pre-commands if provided
    if (preCommands) {
        console.log(`  🔧 Running pre-commands...`);
        const result = await ssh.exec(sshConfig, preCommands, targetDir);
        if (result.exitCode !== 0) {
            throw new Error(`Pre-commands failed: ${result.stderr}`);
        }
        console.log(`  ✓ Pre-commands completed`);
    }

    // 3. Execute docker-compose commands
    console.log(`  🚀 Starting docker-compose...`);
    const filename = path.basename(tplFile);
    const composeCmd = `docker-compose -f ${filename} ${commands}`;
    const result = await ssh.exec(sshConfig, composeCmd, targetDir);

    if (result.exitCode !== 0) {
        throw new Error(`Docker compose failed: ${result.stderr}`);
    }

    console.log(`  ✓ Docker compose completed`);
    if (result.stdout) {
        console.log(`     ${result.stdout}`);
    }
}

// Main export
export default {compose, composeOnRemote};