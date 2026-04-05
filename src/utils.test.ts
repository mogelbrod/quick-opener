import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({ execFile: vi.fn() }))

vi.mock('vscode', () => ({
  window: { activeTextEditor: undefined },
  commands: { executeCommand: vi.fn() },
  extensions: { getExtension: vi.fn() },
  workspace: { getConfiguration: vi.fn(() => ({ get: vi.fn() })) },
}))

import { execFile as execFileCb } from 'node:child_process'
import type { Ref } from './git'
import {
  execGit,
  formatDate,
  formatRef,
  formatRefDescription,
  listChangedFilesAtRef,
  listChangedFilesInWorkingTree,
  pad2,
  RefType,
  toRef,
} from './utils'

describe('toRef()', () => {
  it('should convert a string SHA into a Ref', () => {
    const result = toRef('abc123')
    expect(result).toEqual({ commit: 'abc123', name: 'abc123', type: RefType.Head })
  })

  it('should convert "HEAD" string', () => {
    const result = toRef('HEAD')
    expect(result).toEqual({ commit: 'HEAD', name: 'HEAD', type: RefType.Head })
  })

  it('should pass through a fully-populated Ref object as-is', () => {
    const ref: Ref = { commit: 'abc123', name: 'main', type: RefType.Head }
    const result = toRef(ref)
    expect(result).toBe(ref)
  })

  it('should fill in missing commit and name with empty strings', () => {
    const result = toRef({ type: RefType.Tag })
    expect(result).toEqual({ commit: '', name: '', type: RefType.Tag })
  })

  it('should fill in missing name while preserving commit', () => {
    const result = toRef({ commit: 'abc123' })
    expect(result).toEqual({ commit: 'abc123', name: '', type: RefType.Head })
  })

  it('should fill in missing commit while preserving name', () => {
    const result = toRef({ name: 'develop' })
    expect(result).toEqual({ commit: '', name: 'develop', type: RefType.Head })
  })
})

describe('formatRef()', () => {
  it('should return full SHA for a plain string ref', () => {
    expect(formatRef('abc12345deadbeef')).toBe('abc12345')
  })

  it('should return "HEAD" without abbreviation', () => {
    expect(formatRef('HEAD')).toBe('HEAD')
  })

  it('should return raw commit SHA when withName is false', () => {
    expect(formatRef('abc12345deadbeef', false)).toBe('abc12345deadbeef')
  })

  it('should format a Ref with name different from commit', () => {
    const ref: Ref = { commit: 'abc12345deadbeef', name: 'main', type: RefType.Head }
    expect(formatRef(ref)).toBe('main [abc12345]')
  })

  it('should omit SHA suffix when name equals commit', () => {
    const ref: Ref = { commit: 'abc12345', name: 'abc12345', type: RefType.Head }
    expect(formatRef(ref)).toBe('abc12345')
  })

  it('should abbreviate commit when Ref has no name', () => {
    const ref: Ref = { commit: 'abc12345deadbeef', type: RefType.Head }
    expect(formatRef(ref)).toBe('abc12345')
  })

  it('should return empty string when commit is undefined', () => {
    const ref: Ref = { type: RefType.Head }
    expect(formatRef(ref)).toBe('')
  })

  it('should return raw commit for Ref when withName=false', () => {
    const ref: Ref = { commit: 'abc12345deadbeef', name: 'main', type: RefType.Head }
    expect(formatRef(ref, false)).toBe('abc12345deadbeef')
  })
})

describe('formatDate()', () => {
  // Fixed date: 2026-03-05 14:05:09
  const date = new Date(2026, 2, 5, 14, 5, 9)

  it('should format full date with YYYY-MM-DD', () => {
    expect(formatDate(date, 'YYYY-MM-DD')).toBe('2026-03-05')
  })

  it('should format 2-digit year', () => {
    expect(formatDate(date, 'YY')).toBe('26')
  })

  it('should format abbreviated month', () => {
    expect(formatDate(date, 'MMM')).toBe('Mar')
  })

  it('should format zero-padded month number', () => {
    expect(formatDate(date, 'MM')).toBe('03')
  })

  it('should format zero-padded day', () => {
    expect(formatDate(date, 'DD')).toBe('05')
  })

  it('should format non-padded day', () => {
    const d = new Date(2026, 0, 5)
    expect(formatDate(d, 'D')).toBe('5')
  })

  it('should format zero-padded hours', () => {
    expect(formatDate(date, 'HH')).toBe('14')
  })

  it('should format non-padded hours', () => {
    const d = new Date(2026, 0, 1, 9, 0, 0)
    expect(formatDate(d, 'H')).toBe('9')
  })

  it('should format minutes and seconds', () => {
    expect(formatDate(date, 'mm:ss')).toBe('05:09')
  })

  it('should handle complex format strings', () => {
    expect(formatDate(date, 'YYYY/MM/DD HH:mm:ss')).toBe('2026/03/05 14:05:09')
  })

  it('should preserve literal text', () => {
    expect(formatDate(date, 'YYear: YYYY')).toBe('YYear: 2026')
  })
})

describe('formatRefDescription()', () => {
  const commitDate = new Date(2026, 2, 15, 10, 30, 0)

  const refWithDetails: Ref = {
    type: RefType.Head,
    name: 'main',
    commit: 'abc12345deadbeef',
    commitDetails: {
      hash: 'abc12345deadbeef',
      message: 'feat: add feature\n\nLong description here',
      parents: ['parent1'],
      authorName: 'Alice',
      authorEmail: 'alice@example.com',
      commitDate,
    },
  }

  it('should interpolate simple placeholders', () => {
    expect(formatRefDescription(refWithDetails, '{authorName}')).toBe('Alice')
  })

  it('should interpolate hash placeholder', () => {
    expect(formatRefDescription(refWithDetails, '{hash}')).toBe('abc12345deadbeef')
  })

  it('should truncate message to first line and append ellipsis', () => {
    expect(formatRefDescription(refWithDetails, '{message}')).toBe('feat: add feature…')
  })

  it('should return single-line message without ellipsis', () => {
    const ref: Ref = {
      ...refWithDetails,
      commitDetails: { ...refWithDetails.commitDetails!, message: 'one liner' },
    }
    expect(formatRefDescription(ref, '{message}')).toBe('one liner')
  })

  it('should format dates with a format spec', () => {
    expect(formatRefDescription(refWithDetails, '{commitDate:YYYY-MM-DD}')).toBe('2026-03-15')
  })

  it('should format dates without explicit format', () => {
    const result = formatRefDescription(refWithDetails, '{commitDate}')
    // Just verify it's a non-empty string (locale-dependent)
    expect(result).to.match(/\b(20)?26\b/)
  })

  it('should replace unknown keys with empty string', () => {
    expect(formatRefDescription(refWithDetails, '{nonexistent}')).toBe('')
  })

  it('should handle the default format string', () => {
    const result = formatRefDescription(refWithDetails, '{commitDate} - {authorName}')
    expect(result).to.match(/.+ - Alice$/)
  })

  it('should return empty strings when commitDetails is undefined', () => {
    const ref: Ref = { type: RefType.Head, name: 'main', commit: 'abc' }
    expect(formatRefDescription(ref, '{authorName} - {message}')).toBe(' - ')
  })
})

describe('pad2()', () => {
  it('should pad single digit numbers', () => {
    expect(pad2(5)).toBe('05')
  })

  it('should not pad double digit numbers', () => {
    expect(pad2(15)).toBe('15')
  })

  it('should handle zero', () => {
    expect(pad2(0)).toBe('00')
  })

  it('should handle string input', () => {
    expect(pad2('3')).toBe('03')
  })
})

const mockRepo = { rootUri: { fsPath: '/workspace' } } as any
const mockApi = {
  git: { path: '/usr/bin/git' },
  repositories: [mockRepo],
  getRepository: () => null,
} as any

describe('execGit()', () => {
  const execFileMock = vi.mocked(execFileCb)

  beforeEach(() => {
    execFileMock.mockReset()
  })

  it('runs the given args and returns stdout', async () => {
    execFileMock.mockImplementation((_p, _a, _o, cb: any) =>
      cb(null, { stdout: 'abc123\n', stderr: '' }),
    )
    const result = await execGit(mockApi, ['rev-parse', 'HEAD'])
    expect(result).toBe('abc123\n')
    expect(execFileMock).toHaveBeenCalledWith(
      '/usr/bin/git',
      ['rev-parse', 'HEAD'],
      { cwd: '/workspace' },
      expect.any(Function),
    )
  })

  it('throws an Error with the trimmed stderr message when the command fails', async () => {
    const err = Object.assign(new Error('git error'), { stderr: 'fatal: not a git repository\n' })
    execFileMock.mockImplementation((_p, _a, _o, cb: any) => cb(err))
    await expect(execGit(mockApi, ['status'])).rejects.toThrow('fatal: not a git repository')
  })

  it('rethrows the original error when stderr is empty', async () => {
    const err = Object.assign(new Error('spawn error'), { stderr: '' })
    execFileMock.mockImplementation((_p, _a, _o, cb: any) => cb(err))
    await expect(execGit(mockApi, ['status'])).rejects.toBe(err)
  })
})

describe('listChangedFilesAtRef()', () => {
  const execFileMock = vi.mocked(execFileCb)

  function mockGitOutput(stdout: string) {
    execFileMock.mockImplementation((_p, _a, _o, cb: any) => cb(null, { stdout, stderr: '' }))
  }

  beforeEach(() => {
    execFileMock.mockReset()
  })

  it('passes the correct diff-tree args for the given ref', async () => {
    mockGitOutput('')
    await listChangedFilesAtRef(mockApi, 'abc1234')
    expect(execFileMock).toHaveBeenCalledWith(
      '/usr/bin/git',
      ['diff-tree', '--no-commit-id', '--name-status', '-r', '-z', 'abc1234'],
      { cwd: '/workspace' },
      expect.any(Function),
    )
  })

  it('returns an empty map for empty output', async () => {
    mockGitOutput('')
    expect(await listChangedFilesAtRef(mockApi, 'abc1234')).toEqual(new Map())
  })

  it('parses a single modified file', async () => {
    mockGitOutput('M\0src/foo.ts\0')
    expect(await listChangedFilesAtRef(mockApi, 'abc1234')).toEqual(new Map([['src/foo.ts', 'M']]))
  })

  it('parses multiple files with different statuses', async () => {
    mockGitOutput('A\0src/new.ts\0D\0src/old.ts\0M\0src/changed.ts\0')
    expect(await listChangedFilesAtRef(mockApi, 'abc1234')).toEqual(
      new Map([
        ['src/new.ts', 'A'],
        ['src/old.ts', 'D'],
        ['src/changed.ts', 'M'],
      ]),
    )
  })

  it('keys renamed files by the new path and skips the old path', async () => {
    mockGitOutput('R100\0src/old.ts\0src/new.ts\0')
    expect(await listChangedFilesAtRef(mockApi, 'abc1234')).toEqual(new Map([['src/new.ts', 'R']]))
  })

  it('keys copied files by the destination path', async () => {
    mockGitOutput('C100\0src/orig.ts\0src/copy.ts\0')
    expect(await listChangedFilesAtRef(mockApi, 'abc1234')).toEqual(new Map([['src/copy.ts', 'C']]))
  })

  it('excludes files whose status letter is not in filterByStatus', async () => {
    mockGitOutput('A\0src/new.ts\0D\0src/old.ts\0M\0src/changed.ts\0')
    expect(await listChangedFilesAtRef(mockApi, 'abc1234', 'A')).toEqual(
      new Map([['src/new.ts', 'A']]),
    )
  })

  it('normalizes status letters to uppercase', async () => {
    mockGitOutput('m\0src/foo.ts\0')
    expect(await listChangedFilesAtRef(mockApi, 'abc1234')).toEqual(new Map([['src/foo.ts', 'M']]))
  })
})

describe('listChangedFilesInWorkingTree()', () => {
  const execFileMock = vi.mocked(execFileCb)

  function mockGitOutput(stdout: string) {
    execFileMock.mockImplementation((_p, _a, _o, cb: any) => cb(null, { stdout, stderr: '' }))
  }

  beforeEach(() => {
    execFileMock.mockReset()
  })

  it('passes the correct diff args targeting HEAD', async () => {
    mockGitOutput('')
    await listChangedFilesInWorkingTree(mockApi)
    expect(execFileMock).toHaveBeenCalledWith(
      '/usr/bin/git',
      ['diff', '--name-status', '-z', 'HEAD'],
      { cwd: '/workspace' },
      expect.any(Function),
    )
  })

  it('returns an empty map for empty output', async () => {
    mockGitOutput('')
    expect(await listChangedFilesInWorkingTree(mockApi)).toEqual(new Map())
  })

  it('parses modified and added files', async () => {
    mockGitOutput('M\0src/a.ts\0A\0src/b.ts\0')
    expect(await listChangedFilesInWorkingTree(mockApi)).toEqual(
      new Map([
        ['src/a.ts', 'M'],
        ['src/b.ts', 'A'],
      ]),
    )
  })

  it('respects the filterByStatus parameter', async () => {
    mockGitOutput('M\0src/a.ts\0A\0src/b.ts\0D\0src/c.ts\0')
    expect(await listChangedFilesInWorkingTree(mockApi, 'MD')).toEqual(
      new Map([
        ['src/a.ts', 'M'],
        ['src/c.ts', 'D'],
      ]),
    )
  })

  it('parses renamed files using the new path', async () => {
    mockGitOutput('R100\0src/old.ts\0src/renamed.ts\0')
    expect(await listChangedFilesInWorkingTree(mockApi)).toEqual(new Map([['src/renamed.ts', 'R']]))
  })
})
