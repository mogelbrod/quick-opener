import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PathScanner } from './path-scanner'

// Mock fs.promises for most tests
vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
}))

describe('PathScanner', () => {
  let scanner: PathScanner

  beforeEach(() => {
    scanner = new PathScanner()
  })

  describe('constructor', () => {
    it('should create scanner with default options', () => {
      expect(scanner.exclude.has('node_modules')).toBe(true)
      expect(scanner.exclude.has('.git')).toBe(true)
      expect(scanner.exclude.has('.DS_Store')).toBe(true)
      expect(scanner.maxCandidates).toBe(0)
      expect(scanner.maxDepth).toBe(20)
      expect(scanner.timeout).toBe(100)
    })

    it('should create scanner with custom options', () => {
      const customScanner = new PathScanner({
        maxCandidates: 500,
        maxDepth: 10,
        timeout: 300,
        dirTTL: 60000,
      })
      expect(customScanner.maxCandidates).toBe(500)
      expect(customScanner.maxDepth).toBe(10)
      expect(customScanner.timeout).toBe(300)
      expect(customScanner.dirTTL).toBe(60000)
    })
  })

  describe('`exclude` option', () => {
    it('should add items to exclude set', () => {
      const customScanner = new PathScanner({
        exclude: ['node_modules', '.git'],
      })
      expect(customScanner.exclude.size).toBe(2)
      expect(customScanner.exclude.has('node_modules')).toBe(true)
    })

    it('should handle empty exclude list', () => {
      const customScanner = new PathScanner({
        exclude: [],
      })
      expect(customScanner.exclude.size).toBe(0)
    })
  })

  describe('getEntry()', () => {
    it('should create entry when `createIfMissing` is true', () => {
      const testPath = '/test/path/'
      const entry = scanner.getEntry(testPath, true)
      expect(entry).toBeDefined()
      expect(entry.path).toBe(testPath)
    })

    it('should return undefined when entry does not exist', () => {
      const testPath = '/nonexistent/path/'
      const entry = scanner.getEntry(testPath)
      expect(entry).toBeUndefined()
    })

    it('should return cached entry on subsequent calls', () => {
      const testPath = '/test/path/'
      const entry1 = scanner.getEntry(testPath, true)
      const entry2 = scanner.getEntry(testPath, true)
      expect(entry1).toBe(entry2)
    })

    it('should maintain timestamp on retrieval', () => {
      const testPath = '/test/path/'
      const entry = scanner.getEntry(testPath, true)
      const oldTimestamp = entry.timestamp
      const retrieved = scanner.getEntry(testPath, true)
      expect(retrieved.timestamp).toEqual(oldTimestamp)
    })
  })

  describe('flushEntry()', () => {
    it('should remove entry from cache', () => {
      const testPath = '/test/path/'
      scanner.getEntry(testPath, true)
      expect(scanner.dirs.size).toBe(1)
      const removed = scanner.flushEntry(testPath)
      expect(removed).toBe(true)
      expect(scanner.dirs.size).toBe(0)
    })

    it('should return false when entry does not exist', () => {
      const removed = scanner.flushEntry('/nonexistent/')
      expect(removed).toBe(false)
    })
  })

  describe('filesystem scanning', () => {
    beforeEach(() => {
      // Unmock fs/promises for real filesystem tests
      vi.unmock('fs/promises')
    })

    const repoRoot = path.resolve(__dirname, '../')
    const rootDepth = pathSegments(repoRoot).length

    it('should scan repository root and find src directory', async () => {
      const scanner = new PathScanner({
        exclude: ['node_modules', '.git', 'out', 'dist'],
      })
      const result = await scanner.scan(repoRoot, { maxDepth: 1 })
      expect(result.dirs).toBeDefined()
      const dirNames = result.dirs!.map(d => pathSegments(d).pop()!)
      expect(dirNames).toContain('src')
      expect(dirNames).toContain('test')
    })

    it('should respect exclude option and not include excluded directories', async () => {
      const scanner = new PathScanner({
        exclude: ['node_modules', '.git', 'dist'],
      })
      const result = await scanner.scan(repoRoot, { maxDepth: 1 })
      expect(result.dirs).toBeDefined()
      const dirNames = result.dirs!.map(d => pathSegments(d).pop()!)
      expect(dirNames).toContain('src')
      expect(dirNames).not.toContain('node_modules')
      expect(dirNames).not.toContain('.git')
    })

    it('should respect maxDepth option during scan', async () => {
      const scanner = new PathScanner({ exclude: [] })
      const result = await scanner.scan(repoRoot, { maxDepth: 1 })
      scanner.forEach(result, (pth, isDir) => {
        if (isDir) return
        const dirDepth = pathSegments(pth).length
        expect(dirDepth).toBeLessThanOrEqual(rootDepth + 2)
      })
    })

    it('should handle scanning with higher maxDepth', async () => {
      const scanner = new PathScanner({
        exclude: ['.git', 'out', 'dist'],
      })
      const result = await scanner.scan(repoRoot, { maxDepth: 2 })
      let expectedDepthCount = 0
      scanner.forEach(result, (pth, isDir) => {
        if (!isDir) return
        const dirDepth = pathSegments(pth).length
        expect(dirDepth).toBeLessThanOrEqual(rootDepth + 3)
        if (dirDepth === rootDepth + 2) {
          expectedDepthCount += 1
        }
      })
      expect(expectedDepthCount).toBeGreaterThan(0)
    })

    it('should scan src directory and find typescript files', async () => {
      const srcDir = `${repoRoot}/src/`
      const scanner = new PathScanner({ exclude: [] })
      const result = await scanner.scan(srcDir, { maxDepth: 1 })
      const fileNames = scanner.toArray(result).map(f => pathSegments(f).pop()!)
      expect(fileNames.some(f => f.endsWith('.ts'))).toBe(true)
    })

    it('should find files when scanning src with no depth limit', async () => {
      const srcDir = `${repoRoot}/src/`
      const scanner = new PathScanner({ exclude: [] })
      const result = await scanner.scan(srcDir, { maxDepth: 0 })
      expect(scanner.toArray(result).length).toBeGreaterThan(5)
    })
  })
})

function pathSegments(pth: string): string[] {
  return pth.split(path.sep).filter(Boolean)
}
