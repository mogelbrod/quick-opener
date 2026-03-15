import * as assert from 'assert'
import { describe, it } from 'mocha'
import * as sinon from 'sinon'
import * as vscode from 'vscode'

/** Tests that extension commands can be executed. */
describe('commands', () => {
  it('quickOpener.show command should execute without error', async () => {
    const execStub = sinon.spy(vscode.commands, 'executeCommand')
    try {
      await vscode.commands.executeCommand('quickOpener.show')
      await new Promise(resolve => setTimeout(resolve, 10))
      // TODO: This fails when triggered through mocha test explorer in vscode
      assert.ok(execStub.calledWith('setContext', 'inQuickOpener', 'quick'))
    } finally {
      execStub.restore()
    }
  })
})
