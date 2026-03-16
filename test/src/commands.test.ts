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

  it('quickOpener.showRevisionPicker command should execute without error', async () => {
    const execStub = sinon.spy(vscode.commands, 'executeCommand')
    try {
      await vscode.commands.executeCommand('quickOpener.showRevisionPicker')
      await new Promise(resolve => setTimeout(resolve, 10))
      assert.ok(execStub.calledWith('setContext', 'inQuickOpener', 'revision'))
    } finally {
      execStub.restore()
    }
  })

  it('quickOpener.showRevisionPicker should accept options argument', async () => {
    const execStub = sinon.spy(vscode.commands, 'executeCommand')
    try {
      await vscode.commands.executeCommand('quickOpener.showRevisionPicker', {
        initialValue: 'main',
        branches: true,
        tags: false,
      })
      await new Promise(resolve => setTimeout(resolve, 10))
      assert.ok(execStub.calledWith('setContext', 'inQuickOpener', 'revision'))
    } finally {
      execStub.restore()
    }
  })

  it('quickOpener.showRevisionFilePicker command should execute without error', async () => {
    const execStub = sinon.spy(vscode.commands, 'executeCommand')
    try {
      await vscode.commands.executeCommand('quickOpener.showRevisionFilePicker', 'HEAD')
      await new Promise(resolve => setTimeout(resolve, 10))
      assert.ok(execStub.calledWith('setContext', 'inQuickOpener', 'revision-file'))
    } finally {
      execStub.restore()
    }
  })

  it('quickOpener.showRevisionFilePicker should accept options', async () => {
    const execStub = sinon.spy(vscode.commands, 'executeCommand')
    try {
      await vscode.commands.executeCommand('quickOpener.showRevisionFilePicker', 'HEAD', {
        initialValue: 'src/',
      })
      await new Promise(resolve => setTimeout(resolve, 10))
      assert.ok(execStub.calledWith('setContext', 'inQuickOpener', 'revision-file'))
    } finally {
      execStub.restore()
    }
  })
})
