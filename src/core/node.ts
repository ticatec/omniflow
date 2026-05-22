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
 *   // Get package version
 *   const version = await ctx.actions.node.getPackageVersion(pkgDir)
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
 * Get the version string from package.json
 *
 * @param packageDir - Directory containing package.json
 * @returns Package version string
 *
 * @example
 * ```ts
 * const version = await getPackageVersion('/path/to/project');
 * // returns: '1.0.0'
 * ```
 */
async function getPackageVersion(packageDir: string): Promise<string> {
    const packageJsonPath = path.join(packageDir, 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content);
    return packageJson.version;
}

/**
 * Get the package name from package.json
 *
 * @param packageDir - Directory containing package.json
 * @returns Package name string
 *
 * @example
 * ```ts
 * const name = await getPackageName('/path/to/project');
 * // returns: 'my-awesome-package'
 * ```
 */
async function getPackageName(packageDir: string): Promise<string> {
    const packageJsonPath = path.join(packageDir, 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content);
    return packageJson.name;
}

/**
 * Get both package name and version from package.json
 *
 * @param packageDir - Directory containing package.json
 * @returns Object containing name and version
 *
 * @example
 * ```ts
 * const info = await getPackageInfo('/path/to/project');
 * // returns: { name: 'my-package', version: '1.0.0' }
 * ```
 */
async function getPackageInfo(packageDir: string): Promise<{ name: string; version: string }> {
    const [name, version] = await Promise.all([
        getPackageName(packageDir),
        getPackageVersion(packageDir)
    ]);
    return {name, version};
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
    const defaultFlags = pm === 'pnpm' ? ['--no-frozen-lockfile', '--allow-builds'] : [];
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
    await $`cd ${packageDir} && ${pm} run build ${flags}`;
    console.log(`  ✓ run build completed`);
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
    await $`cd ${packageDir} && ${pm} run ${command} ${flags}`;
    console.log(`  ✓ run ${command} completed`);
}

export default {
    getPackageVersion,
    getPackageName,
    getPackageInfo,
    install,
    build,
    execute
}