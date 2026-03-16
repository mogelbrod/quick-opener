import { describe, expect, it, vi } from 'vitest'

vi.mock('vscode', () => ({
  window: { activeTextEditor: undefined },
  commands: { executeCommand: vi.fn() },
  extensions: { getExtension: vi.fn() },
  workspace: { getConfiguration: vi.fn(() => ({ get: vi.fn() })) },
}))

import type { Ref } from './git'
import { formatDate, formatRef, formatRefDescription, MONTHS, pad2, RefType, toRef } from './utils'

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
