/**
 * Omniflow Node.js Utilities
 * Provides Node.js package management operations for deployment scripts
 *
 * @example
 * ```ts
 * // In a deployment script module, access via ctx.actions.node
 * export default async (ctx) => {
 *   const pkgDir = ctx.workspace
 *
 *   // Get package info (includes fullName and namespace for scoped packages)
 *   const info = await ctx.actions.node.getPackageInfo(pkgDir)
 *   // returns: { name: '@scope/package', version: '1.0.0', fullName: '@scope/package', namespace: 'scope' }
 *
 *   // Install dependencies
 *   await ctx.actions.node.install(pkgDir, 'pnpm')
 *
 *   // Build project
 *   await ctx.actions.node.build(pkgDir, 'pnpm')
 *
 *   // Run custom command
 *   await ctx.actions.node.execute(pkgDir, 'npm', 'test', ['--coverage'])
 * }
 * ```
 */

import * as path from 'path';
import {promises as fs} from 'fs';
import {$} from './shell.js';

/**
 * Supported package managers
 */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/**
 * Get package name, version, fullName, and optionally namespace from package.json
 *
 * @param packageDir - Directory containing package.json
 * @returns Object containing name, version, fullName, and optionally namespace
 *
 * @example
 * ```ts
 * const info = await getPackageInfo('/path/to/project');
 * // returns: { name: 'my-package', version: '1.0.0', fullName: 'my-package' }
 *
 * const scopedInfo = await getPackageInfo('/path/to/scoped-project');
 * // returns: { name: '@scope/package', version: '1.0.0', fullName: '@scope/package', namespace: 'scope' }
 * ```
 */
async function getPackageInfo(packageDir: string): Promise<{
    name: string;
    version: string;
    fullName: string;
    namespace?: string;
}> {
    const packageJsonPath = path.join(packageDir, 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content);
    const name = packageJson.name;
    const version = packageJson.version;
    const fullName = packageJson.name;

    // Parse scoped package name (@namespace/name)
    if (name.startsWith('@')) {
        const parts = name.split('/');
        if (parts.length >= 2) {
            const namespace = parts[0].slice(1); // Remove '@' prefix
            return {name, version, fullName, namespace};
        }
    }

    return {name, version, fullName};
}

/**
 * Install Node.js dependencies using the specified package manager
 *
 * @param packageDir - Directory containing package.json
 * @param pm - Package manager to use
 * @param flags - Optional additional flags (e.g., ['--frozen-lockfile'])
 *
 * @example
 * ```ts
 * await install('/path/to/project', 'pnpm', ['--frozen-lockfile']);
 * ```
 */
async function install(packageDir: string, pm: 'npm' | 'pnpm' | 'yarn' | 'bun', flags: string[] = []): Promise<void> {
    console.log(`  📦 Installing node modules with ${pm}...`);

    // Default flags for pnpm to bypass supply-chain strict checks
    const defaultFlags = pm === 'pnpm' ? ['--no-frozen-lockfile', '--dangerously-allow-all-builds'] : [];
    const allFlags = [...defaultFlags, ...flags];

    await $`cd ${packageDir} && ${pm} install ${allFlags}`;
    console.log(`  ✓ Node modules installed`);
}

/**
 * Build the project using the specified package manager
 * This is a convenience function that runs the 'build' script
 *
 * @param packageDir - Directory containing package.json
 * @param pm - Package manager to use
 * @param flags - Optional additional flags
 *
 * @example
 * ```ts
 * await build('/path/to/project', 'pnpm');
 * ```
 */
async function build(packageDir: string, pm: 'npm' | 'pnpm' | 'yarn' | 'bun', flags: string[] = []): Promise<void> {
    console.log(`  🔨 Building with ${pm} run build...`);
    try {
        if (flags.length > 0) {
            await $`bash -c "cd ${packageDir} && ${pm} run build ${flags.join(' ')}"`;
        } else {
            await $`bash -c "cd ${packageDir} && ${pm} run build"`;
        }
        console.log(`  ✓ run build completed`);
    } catch (error: any) {
        console.error(`  ✗ build failed: ${error.message}`);
        if (error.stdout) console.error(`stdout: ${error.stdout}`);
        if (error.stderr) console.error(`stderr: ${error.stderr}`);
        throw error;
    }
}

/**
 * Run a package manager command (e.g., build, test, lint)
 *
 * @param packageDir - Directory containing package.json
 * @param pm - Package manager to use
 * @param command - npm script command to run (e.g., 'test', 'lint')
 * @param flags - Optional additional flags
 *
 * @example
 * ```ts
 * await execute('/path/to/project', 'pnpm', 'build');
 *
 * // With flags
 * await execute('/path/to/project', 'npm', 'test', ['--coverage']);
 * ```
 */
async function execute(packageDir: string, pm: 'npm' | 'pnpm' | 'yarn' | 'bun', command: string, flags: string[] = []): Promise<void> {
    console.log(`  🔨 Executing with ${pm} run ${command}...`);
    if (flags.length > 0) {
        await $`cd ${packageDir} && ${pm} run ${command} ${flags}`;
    } else {
        await $`cd ${packageDir} && ${pm} run ${command}`;
    }
    console.log(`  ✓ run ${command} completed`);
}

export default {
    getPackageInfo,
    install,
    build,
    execute
}