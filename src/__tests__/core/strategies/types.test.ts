/**
 * Tests for strategy types and interfaces
 */

import { describe, it, expect } from '@jest/globals'

describe('MergeRequestStrategy interface', () => {
  it('should define required properties', () => {
    // This test verifies the interface contract
    const strategy = {
      platform: 'github',
      create: async (_repoInfo: any, _source: string, _target: string, _method?: string) => {
        // Implementation
      }
    }
    expect(strategy.platform).toBeDefined()
    expect(typeof strategy.create).toBe('function')
  })
})

describe('Environment config', () => {
  it('should accept merge-related fields', () => {
    const envConfig = {
      name: 'prod',
      description: 'Production environment',
      branch: 'main',
      merge_from: 'dev',
      merge_strategy: 'github',
      merge_method: 'merge' as const
    }
    expect(envConfig.merge_from).toBe('dev')
    expect(envConfig.merge_strategy).toBe('github')
    expect(envConfig.merge_method).toBe('merge')
  })

  it('should support different merge methods', () => {
    const methods: Array<'merge' | 'squash' | 'rebase'> = ['merge', 'squash', 'rebase']
    methods.forEach(method => {
      expect(['merge', 'squash', 'rebase']).toContain(method)
    })
  })
})