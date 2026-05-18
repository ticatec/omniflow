/**
 * Merge request strategy registry
 *
 * Manages available strategies for creating pull/merge requests
 * across different platforms (GitHub, GitLab, Forgejo, etc.)
 */

import GitHubRequest from './GitHubRequest'
import GitLabRequest from './GitLabRequest'
import ForgejoRequest from './ForgejoRequest'
import type {MergeRequestStrategy} from './types.js'

/**
 * Registry for merge request strategies
 * Allows registration and retrieval of platform-specific strategies
 */
class MergeRequestStrategyRegistry {
    private strategies = new Map<string, MergeRequestStrategy>()

    constructor() {
        // Register built-in strategies
        this.register(new GitHubRequest())
        this.register(new GitLabRequest())
        this.register(new ForgejoRequest())
    }

    /**
     * Register a new strategy
     * @param strategy - The strategy to register
     */
    register(strategy: MergeRequestStrategy): void {
        this.strategies.set(strategy.platform, strategy)
    }

    /**
     * Get a strategy by name
     * @param name - Strategy platform name (e.g., 'github', 'gitlab', 'forgejo')
     * @returns The strategy or undefined if not found
     */
    get(name: string): MergeRequestStrategy | undefined {
        return this.strategies.get(name)
    }

    /**
     * List all registered strategy names
     * @returns Array of platform names
     */
    listStrategies(): string[] {
        return Array.from(this.strategies.keys())
    }
}

/** Global strategy registry instance */
export const strategyRegistry = new MergeRequestStrategyRegistry()

// Type exports
export * from './types.js'
export {default as BaseMergeRequest} from './BaseMergeRequest.js'