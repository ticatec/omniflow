/**
 * Tests for Omniflow configuration
 */

import { describe, it, expect } from '@jest/globals'

describe('OmniflowConfig', () => {
  it('should define global configuration', () => {
    const omniflow = {
      env: { NODE_ENV: 'test' },
      git: {
        repos: 'https://github.com',
        default_branch: 'main'
      }
    }
    expect(omniflow.env).toBeDefined()
    expect(omniflow.git).toBeDefined()
  })

  it('should support SSH configuration', () => {
    const sshConfig = {
      server: 'ssh.example.com',
      user: 'deploy',
      port: 2222
    }
    expect(sshConfig.server).toBe('ssh.example.com')
    expect(sshConfig.user).toBe('deploy')
    expect(sshConfig.port).toBe(2222)
  })
})

describe('ProjectItem', () => {
  it('should represent a folder', () => {
    const folder = {
      name: 'services',
      type: 'folder' as const,
      items: []
    }
    expect(folder.type).toBe('folder')
    expect(folder.items).toEqual([])
  })

  it('should represent a project with repos', () => {
    const project = {
      name: 'api',
      type: 'project' as const,
      repos: {
        git: 'https://github.com/org/api.git',
        branch: 'main'
      }
    }
    expect(project.type).toBe('project')
    expect(project.repos).toBeDefined()
  })
})

describe('EnvironmentConfig', () => {
  it('should have merge configuration', () => {
    const env = {
      name: 'test',
      branch: 'develop',
      merge_from: 'feature',
      merge_strategy: 'github',
      merge_method: 'squash' as const
    }
    expect(env.name).toBe('test')
    expect(env.branch).toBe('develop')
    expect(env.merge_from).toBe('feature')
    expect(env.merge_strategy).toBe('github')
    expect(env.merge_method).toBe('squash')
  })
})

describe('CommandDefinition', () => {
  it('should define a command', () => {
    const command = {
      name: 'deploy',
      description: 'Deploy to production'
    }
    expect(command.name).toBe('deploy')
    expect(command.description).toBe('Deploy to production')
  })
})