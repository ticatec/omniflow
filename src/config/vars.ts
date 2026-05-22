/**
 * Variable merging utilities for Omniflow
 * Handles merging of configuration variables from multiple levels
 * with support for string, array, and object values
 */

import type { ProjectItem, EnvironmentConfig } from '../types/config.js'

export type VarValue = string | string[] | Record<string, any>

/**
 * Recursively merge vars from source into target
 * - String values: override
 * - Array values: merge (no duplicates)
 * - Object values: deep merge (recursive)
 */
function mergeVars(
  target: Record<string, VarValue>,
  source: Record<string, VarValue> | undefined
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
    } else if (typeof value === 'object' && value !== null) {
      // Object value: deep merge with existing object
      const existing = target[key]
      if (typeof existing === 'object' && existing !== null && !Array.isArray(existing)) {
        // Deep merge objects
        target[key] = {...(existing as Record<string, any>), ...value}
      } else {
        // No existing object, use new object
        target[key] = value
      }
    } else {
      // String or primitive value: override
      target[key] = value
    }
  }
}

/**
 * Collect vars from the project path (traverses folder hierarchy)
 * Returns vars from all folders in the path + the project itself
 * Supports string, array, and object values (arrays and objects are merged)
 */
export function collectVarsFromPath(
  pathParts: string[],
  omniflowEnv: Record<string, VarValue> | undefined,
  projects: ProjectItem[]
): Record<string, VarValue> {
  const vars: Record<string, VarValue> = {}

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
 * String values override, array and object values are merged
 */
export function getMergedVars(
  pathVars: Record<string, VarValue>,
  envConfig: EnvironmentConfig
): Record<string, VarValue> {
  const result: Record<string, VarValue> = { ...pathVars }

  if (envConfig.vars) {
    mergeVars(result, envConfig.vars)
  }

  return result
}