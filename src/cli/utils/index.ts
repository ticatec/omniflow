/**
 * Omniflow System Utilities
 * Utility functions available in deployment scripts via ctx.utils
 */

import path from 'path'
import { promises as fs } from 'fs'

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
  const { sourceFile, targetFile, variables } = opts

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
 * @param opts.workspace - Workspace directory path
 * @param opts.subdir - Optional subdirectory
 * @returns Version string
 */
export async function getPackageVersion(opts: {
  workspace: string
  subdir?: string
}): Promise<string> {
  const { workspace, subdir } = opts

  const packageJsonPath = subdir
    ? path.join(workspace, subdir, 'package.json')
    : path.join(workspace, 'package.json')

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
  const { env, indent = '  ' } = opts

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
  const { envArrays, indent = '    ' } = opts

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
 * Create utils object for ctx.utils
 */
export function createUtils() {
  return {
    templateReplace,
    getPackageVersion,
    formatDockerEnv,
    mergeDockerEnv
  }
}