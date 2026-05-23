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
import {promises as pfs} from 'fs';
import * as fs from 'fs';
import {$} from './shell.js';
import ssh, {type SshConnectionConfig} from './ssh.js';


function createComposeCommands(workDir: string, preCommands: string): string {
    return `cd ${workDir}
    ${preCommands}
    docker compose up -d`
}

/**
 * Create docker-compose containers locally
 *
 * @param workDir - Working directory for docker-compose
 * @param tplFile - Path to docker-compose template file
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
async function compose(targetDir: string, tplFile: string, preCommands?: string): Promise<void> {
    console.log(`  🐳 Local Docker Compose`);
    console.log(`     targetDir: ${targetDir}`);

    if (!fs.existsSync(targetDir)) {
        console.log(`创建docker 应用主目录`)
        await pfs.mkdir(targetDir, '-p');
    }

    await $`cp ${tplFile} ${targetDir}/`;

    const composeCmd = createComposeCommands(targetDir, preCommands??'');

    // Execute docker-compose
    console.log(`  🚀 Starting docker-compose...`);
    try {
        await $`${composeCmd}`;
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
    preCommands?: string
): Promise<void> {
    console.log(`  🐳 Remote Docker Compose: ${sshConfig.user}@${sshConfig.host}:${sshConfig.port || 22}`);
    console.log(`     Target: ${targetDir}`);
    console.log(`     Template: ${tplFile}`);

    // 1. Copy template file to remote (creates directory if needed)
    await ssh.cp(sshConfig, tplFile, targetDir);

    const result = await ssh.exec(sshConfig, createComposeCommands(targetDir, preCommands??''))

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