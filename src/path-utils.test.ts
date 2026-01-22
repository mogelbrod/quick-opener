import * as path from 'path'
import { describe, expect, it } from 'vitest'
import {
  appendDirSuffix,
  hasDirSuffix,
  isDot,
  isWorkspaceFile,
  sepRegex,
  trimDirSuffix,
} from './path-utils'

describe('path-utils', () => {
  describe('isDot()', () => {
    it('should return true for "."', () => {
      expect(isDot('.')).toBe(true)
    })

    it('should return true for ".."', () => {
      expect(isDot('..')).toBe(true)
    })

    it('should return false for other paths', () => {
      expect(isDot('file.txt')).toBe(false)
      expect(isDot('dir/file')).toBe(false)
      expect(isDot('...')).toBe(false)
      expect(isDot('.hidden')).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isDot('')).toBe(false)
    })
  })

  describe('hasDirSuffix()', () => {
    it('should return true for paths ending with separator', () => {
      expect(hasDirSuffix(`dir${path.sep}`)).toBe(true)
      expect(hasDirSuffix(`${path.sep}`)).toBe(true)
    })

    it('should return false for paths without separator', () => {
      expect(hasDirSuffix('file.txt')).toBe(false)
      expect(hasDirSuffix('dir')).toBe(false)
      expect(hasDirSuffix('')).toBe(false)
    })
  })

  describe('appendDirSuffix()', () => {
    it('should append separator if not present', () => {
      const result = appendDirSuffix('dir')
      expect(result).toBe(`dir${path.sep}`)
    })

    it('should not double-append separator', () => {
      const withSep = `dir${path.sep}`
      expect(appendDirSuffix(withSep)).toBe(withSep)
    })

    it('should handle empty string', () => {
      expect(appendDirSuffix('')).toBe(path.sep)
    })

    it('should handle root path', () => {
      const root = path.sep
      expect(appendDirSuffix(root)).toBe(root)
    })
  })

  describe('trimDirSuffix()', () => {
    it('should remove trailing separator', () => {
      const withSep = `dir${path.sep}`
      expect(trimDirSuffix(withSep)).toBe('dir')
    })

    it('should handle paths without separator', () => {
      expect(trimDirSuffix('dir')).toBe('dir')
    })

    it('should remove separator from root returning empty string', () => {
      expect(trimDirSuffix(path.sep)).toBe('')
    })

    it('should handle empty string', () => {
      expect(trimDirSuffix('')).toBe('')
    })
  })

  describe('isWorkspaceFile()', () => {
    it('should return true for .code-workspace files', () => {
      expect(isWorkspaceFile('workspace.code-workspace')).toBe(true)
      expect(isWorkspaceFile('my-project.code-workspace')).toBe(true)
    })

    it('should return false for other files', () => {
      expect(isWorkspaceFile('file.txt')).toBe(false)
      expect(isWorkspaceFile('workspace.json')).toBe(false)
      expect(isWorkspaceFile('.code-workspace')).toBe(false)
      expect(isWorkspaceFile('workspace')).toBe(false)
    })

    it('should return false for paths with .code-workspace in directory', () => {
      expect(isWorkspaceFile(`dir.code-workspace${path.sep}file.txt`)).toBe(false)
    })
  })

  describe('sepRegex', () => {
    it('should create valid regex pattern', () => {
      const pattern = new RegExp(sepRegex)
      expect(pattern.test(path.sep)).toBe(true)
    })

    it('should match path separator', () => {
      const parts = 'dir/file'.split(new RegExp(sepRegex))
      expect(parts.length).toBeGreaterThan(1)
    })
  })
})
