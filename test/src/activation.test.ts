import * as assert from 'assert'
import { describe, it } from 'mocha'
import * as vscode from 'vscode'

/** Tests the extension's activation and command registration */
describe('activation', () => {
  it('extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('mogelbrod.quickopener'))
  })

  it('extension should activate successfully', async function () {
    this.timeout(10e3)
    const ext = vscode.extensions.getExtension('mogelbrod.quickopener')
    assert.ok(ext)
    await ext.activate()
    assert.strictEqual(ext.isActive, true)
  })

  it('commands should be registered', async () => {
    const commands = await vscode.commands.getCommands()
    assert.ok(commands.includes('quickOpener.show'))
    assert.ok(commands.includes('quickOpener.popPath'))
    assert.ok(commands.includes('quickOpener.triggerAction'))
    assert.ok(commands.includes('quickOpener.triggerItemAction'))
    assert.ok(commands.includes('quickOpener.triggerTabCompletion'))
  })
})
