import * as assert from 'assert'
import { describe, it } from 'mocha'
import * as vscode from 'vscode'

/**
 * E2E Test Suite: Configuration
 *
 * Tests that extension configuration is properly loaded and validated
 */
describe('configuration', () => {
  it('should exist', () => {
    const config = vscode.workspace.getConfiguration('quickOpener')
    assert.ok(config)
  })

  it('should provide default values', () => {
    const config = vscode.workspace.getConfiguration('quickOpener')
    assert.notStrictEqual(config.get('fallbackDirectory'), undefined)
    const prefixes = config.get('prefixes')
    assert.notStrictEqual(prefixes, undefined)
    assert.strictEqual(typeof prefixes, 'object')
    const exclude = config.get('exclude')
    assert.notStrictEqual(exclude, undefined)
    assert.strictEqual(Array.isArray(exclude), true)
    const icons = config.get('icons')
    assert.strictEqual(typeof icons, 'boolean')
    const timeout = config.get('timeout')
    assert.strictEqual(typeof timeout, 'number')
    assert.ok((timeout as number) >= 0)
    const maxCandidates = config.get('maxCandidates')
    assert.strictEqual(typeof maxCandidates, 'number')
    assert.ok((maxCandidates as number) >= 100)
  })
})
