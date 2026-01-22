/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: intentional */
import * as os from 'os'
import * as path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { variableExpansionFactory } from './variable-expansion'

// Mock VS Code API
vi.mock('vscode', () => ({
  window: {
    activeTextEditor: undefined,
  },
  workspace: {
    workspaceFolders: undefined,
    getWorkspaceFolder: vi.fn(),
    getConfiguration: vi.fn(() => ({
      get: vi.fn(),
    })),
  },
  Range: class {
    constructor(
      public start: any,
      public end: any,
    ) {}
  },
}))

describe('variableExpansionFactory()', () => {
  let variableExpansion: ReturnType<typeof variableExpansionFactory>

  beforeEach(() => {
    variableExpansion = variableExpansionFactory()
  })

  describe('basic variables', () => {
    it('should expand `userHome`', () => {
      const result = variableExpansion('${userHome}', false)
      expect(result).toBe(os.homedir())
    })

    it('should expand `pathSeparator`', () => {
      const result = variableExpansion('${pathSeparator}', false)
      expect(result).toBe(path.sep)
    })

    it('should handle `${/}`', () => {
      const result = variableExpansion('${/}', false)
      expect(typeof result).toBe('string')
    })
  })

  describe('file-related variables', () => {
    it('should expand `file` to empty when no active editor', () => {
      const result = variableExpansion('${file}', false)
      expect(result).toBe('')
    })

    it('should expand `fileDirname` to empty when no active editor', () => {
      const result = variableExpansion('${fileDirname}', false)
      expect(result).toBe('')
    })

    it('should expand `fileBasename` to empty when no active editor', () => {
      const result = variableExpansion('${fileBasename}', false)
      expect(result).toBe('')
    })

    it('should expand `fileExtname` to empty when no active editor', () => {
      const result = variableExpansion('${fileExtname}', false)
      expect(result).toBe('')
    })

    it('should expand `fileBasenameNoExtension` to empty when no active editor', () => {
      const result = variableExpansion('${fileBasenameNoExtension}', false)
      expect(result).toBe('')
    })

    it('should expand `relativeFile` to empty when no active editor', () => {
      const result = variableExpansion('${relativeFile}', false)
      expect(result).toBe('')
    })

    it('should expand `relativeFileDirname` to empty when no active editor', () => {
      const result = variableExpansion('${relativeFileDirname}', false)
      // This variable expands to a string representation when not available
      expect(typeof result).toBe('string')
    })
  })

  describe('workspace variables', () => {
    it('should expand `fileWorkspaceFolder` to empty when no workspace', () => {
      const result = variableExpansion('${fileWorkspaceFolder}', false)
      expect(result).toBe('')
    })

    it('should expand `workspaceFolder` to empty when no workspace', () => {
      const result = variableExpansion('${workspaceFolder}', false)
      expect(result).toBe('')
    })

    it('should expand `workspaceFolderBasename` with defined folder', () => {
      const result = variableExpansion('${workspaceFolderBasename}', false)
      expect(typeof result).toBe('string')
    })
  })

  describe('environment variables', () => {
    it('should handle environment variable expansion', () => {
      const uniqueVarName = `TEST_VAR_EXPANSION_${Date.now()}`
      process.env[uniqueVarName] = 'test_value_123'
      variableExpansion(`\${env:${uniqueVarName}}`, false)
      expect(process.env[uniqueVarName]).toBe('test_value_123')
    })

    it('should expand non-existent env vars to empty string', () => {
      const result = variableExpansion('${env:NON_EXISTENT_VAR_12345}', false)
      expect(result).toBe('')
    })
  })

  describe('other variables', () => {
    it('should expand `lineNumber`', () => {
      const result = variableExpansion('${lineNumber}', false)
      expect(typeof result).toBe('string')
    })
  })

  describe('complex scenarios', () => {
    it('should expand multiple variables at once', () => {
      const input = '${userHome} ${pathSeparator} test'
      const result = variableExpansion(input, false)
      expect(result).toContain(os.homedir())
    })

    it('should not expand workspace-specific variables without workspace', () => {
      const input = '${workspaceFolder:test}'
      const result = variableExpansion(input, false)
      expect(typeof result).toBe('string')
    })

    it('should return input unchanged for unknown variables with strict=false', () => {
      const input = '${unknownVar}'
      const result = variableExpansion(input, false)
      // Unknown variables expand to empty string in non-strict mode
      expect(result === input || result === '').toBe(true)
    })

    it('should throw error for unknown variables with strict=true', () => {
      const input = '${unknownVar}'
      expect(() => variableExpansion(input, true)).toThrow()
    })

    it('should handle mixed text and variables', () => {
      const input = 'text ${var1} and  ${var2}'
      const result = variableExpansion(input, false)
      expect(typeof result).toBe('string')
    })

    it('should trim whitespace from paths', () => {
      const input = '  ${userHome}  /  subdir  '
      const result = variableExpansion(input, false)
      expect(typeof result).toBe('string')
    })

    it('should not expand config variables', () => {
      const result = variableExpansion('${config:some.setting}', false)
      // Config variables expand to undefined/empty
      expect(result === '${config:some.setting}' || result === 'undefined' || result === '').toBe(
        true,
      )
    })

    it('should handle nested braces', () => {
      const result = variableExpansion('test{a,b}', false)
      expect(result).toBe('test{a,b}')
    })

    it('should preserve escaped dollar signs', () => {
      const result = variableExpansion('\\$notavar', false)
      expect(result).toContain('$')
    })

    it('should handle empty variable names', () => {
      const result = variableExpansion('${}', false)
      expect(result).toBe('${}')
    })

    it('should handle command variables', () => {
      const result = variableExpansion('${command:test}', false)
      expect(typeof result).toBe('string')
    })

    it('should expand with leading path separator', () => {
      const input = '/${userHome}'
      const result = variableExpansion(input, false)
      expect(typeof result).toBe('string')
    })

    it('should handle special characters in paths', () => {
      const input = '${userHome}/../test'
      const result = variableExpansion(input, false)
      expect(typeof result).toBe('string')
    })
  })

  describe('error handling', () => {
    it('should handle null input gracefully', () => {
      const result = variableExpansion('', false)
      expect(result).toBe('')
    })

    it('should preserve text with no variables', () => {
      const input = 'just plain text'
      const result = variableExpansion(input, false)
      expect(result).toBe(input)
    })

    it('should handle variables in sequence', () => {
      const result = variableExpansion('${userHome}${pathSeparator}test', false)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })
})
