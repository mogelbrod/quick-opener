import { describe, expect, it, vi } from 'vitest'

vi.mock('vscode', () => ({
  commands: { executeCommand: vi.fn() },
  ThemeIcon: class ThemeIcon {
    constructor(public id: string) {}
  },
}))

import * as vscode from 'vscode'
import { getButtonAction, type InputButton } from './opener'

const ACTIONS = {
  alpha: { id: 'a', iconPath: new vscode.ThemeIcon('a'), tooltip: 'Alpha' },
  beta: { id: 'b', iconPath: new vscode.ThemeIcon('b'), tooltip: 'Beta' },
  gamma: { id: 'c', iconPath: new vscode.ThemeIcon('c'), tooltip: 'Gamma' },
} as const satisfies Record<string, InputButton>

type Action = (typeof ACTIONS)[keyof typeof ACTIONS]

const buttons: readonly Action[] = [ACTIONS.alpha, ACTIONS.beta]

describe('getButtonAction()', () => {
  it('should resolve by 1-based numeric offset', () => {
    expect(getButtonAction(1, buttons, ACTIONS)).toBe(ACTIONS.alpha)
    expect(getButtonAction(2, buttons, ACTIONS)).toBe(ACTIONS.beta)
  })

  it('should resolve by string action ID', () => {
    expect(getButtonAction('alpha', buttons, ACTIONS)).toBe(ACTIONS.alpha)
    expect(getButtonAction('gamma', buttons, ACTIONS)).toBe(ACTIONS.gamma)
  })

  it('should pass through an action object directly', () => {
    expect(getButtonAction(ACTIONS.beta, buttons, ACTIONS)).toBe(ACTIONS.beta)
  })

  it('should throw for an out-of-range numeric offset', () => {
    expect(() => getButtonAction(0, buttons, ACTIONS)).toThrow('Unknown action')
    expect(() => getButtonAction(5, buttons, ACTIONS)).toThrow('Unknown action')
  })

  it('should throw for an unknown string ID', () => {
    expect(() => getButtonAction('nonexistent', buttons, ACTIONS)).toThrow('Unknown action')
  })

  it('should handle undefined buttons array for numeric offset', () => {
    expect(() => getButtonAction(1, undefined, ACTIONS)).toThrow('Unknown action')
  })

  it('should still resolve string IDs when buttons is undefined', () => {
    expect(getButtonAction('alpha', undefined, ACTIONS)).toBe(ACTIONS.alpha)
  })
})
