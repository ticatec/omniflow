/**
 * Variable merging utilities for Omniflow
 * Handles merging of configuration variables from multiple levels
 * with support for both string and array values
 */

import type { ProjectItem, EnvironmentConfig } from '../types/config.js'

/**
 * Merge vars from source into target
 * String values override, array values are merged
 */
function mergeVars(
  target: Record<string, string | string[]>,
  source: Record<string, string | string[]> | undefined
): void {
  if (!source) return

  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      // Array value: merge with existing array
      const existing = target[key]
      if (Array.isArray(existing)) {
        // Merge arrays, avoid duplicates (first occurrence wins)
        const merged = [...existing]
        for (const item of value) {
          if (!merged.includes(item)) {
            merged.push(item)
          }
        }
        target[key] = merged
      } else {
        // No existing array, use new array
        target[key] = value
      }
    } else {
      // String value: override
      target[key] = value
    }
  }
}

/**
 * Collect vars from the project path (traverses folder hierarchy)
 * Returns vars from all folders in the path + the project itself
 * Supports both string values and array values (arrays are merged)
 */
export function collectVarsFromPath(
  pathParts: string[],
  omniflowEnv: Record<string, string | string[]> | undefined,
  projects: ProjectItem[]
): Record<string, string | string[]> {
  const vars: Record<string, string | string[]> = {}

  // Start with global vars
  mergeVars(vars, omniflowEnv)

  // Traverse the path and collect vars from each folder
  let currentItems = projects
  for (const part of pathParts) {
    const item = currentItems.find(i => i.name === part)
    if (!item) break

    // Merge vars from this level (folder or project)
    mergeVars(vars, item.vars)

    // Move to next level if this is a folder
    if (item.items) {
      currentItems = item.items
    } else {
      break // Reached a project, stop traversing
    }
  }

  return vars
}

/**
 * Get merged variables for a project and environment
 * Priority: global -> parent folders -> project -> environment (later overrides earlier)
 * Array values are merged, string values are overridden
 */
export function getMergedVars(
  pathVars: Record<string, string | string[]>,
  envConfig: EnvironmentConfig
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = { ...pathVars }

  if (envConfig.vars) {
    mergeVars(result, envConfig.vars)
  }

  return result
}