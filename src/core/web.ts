/**
 * Omniflow Web Build Utilities
 * Provides web frontend build and packaging operations
 *
 * @example
 * ```ts
 * import web from './core/web'
 *
 * // Build and compress web app
 * await web.build({
 *   projectName: 'my-app',
 *   packageManager: 'npm',
 *   workDir: '/path/to/project',
 *   outputDir: 'build',
 *   compress: true,
 *   suffix: 'prod'
 * })
 * ```
 */

import * as path from 'path';
import {promises as fs} from 'fs';
import node, {type PackageManager} from "./node.js";
import {tar} from "../cli/utils/index.js"

/**
 * Options for building web applications
 */
export interface WebBuildOptions {
    /** Package manager to use */
    pm: PackageManager;
    /** Working directory containing package.json */
    workDir: string;
    /** build directory **/
    target: string;
    /** Output directory containing built files (relative to workDir) */
    outputDir: string;
    /** Optional suffix for archive filename */
    suffix?: string;
    /** Optional subdirectory path (relative to workDir) */
    subdir?: string;
    /** Additional flags for install command */
    installFlags?: string[];
    /** Additional flags for build command */
    buildFlags?: string[];
}



/**
 * Build web frontend application
 *
 * @param opts - Build options
 * @returns Build result with archive path (if compressed)
 *
 * @example
 * ```ts
 * const result = await build({
 *   projectName: 'my-web-app',
 *   packageManager: 'pnpm',
 *   workDir: '/path/to/project',
 *   target: 'build',
 *   outputDir: '/path/to/output',
 *   compress: true,
 *   suffix: 'production'
 * });
 *
 * if (result.success) {
 *   console.log(`Build archive: ${result.archivePath}`);
 * }
 * ```
 */
async function build(opts: WebBuildOptions): Promise<string> {
    const {
        pm,
        workDir,
        target,
        outputDir,
        suffix,
        subdir,
        installFlags = [],
        buildFlags = []
    } = opts;

    // Verify workDir exists
    const workspace = subdir ? path.join(workDir, subdir) : workDir;
    try {
        await fs.access(workspace);
    } catch {
        throw new Error(`Working directory does not exist: ${workspace}`);
    }

    let pkgInfo = await node.getPackageInfo(workspace);

    console.log(`  📌 Project: ${pkgInfo.name} v${pkgInfo.version}`);

    await node.install(workspace, pm, installFlags);

    await node.build(workspace, pm, buildFlags);

    let filename = `${pkgInfo.name}${suffix}-${pkgInfo.version}`;

    return await tar({sourceDir: `${workspace}/${target}`, filename, outputDir})

}

// Main export
export default {build};