import * as vscode from 'vscode'
import * as path from 'path'
import { QuickOpener } from './quick-opener'

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('quick-opener.show', () => {
    const activeFileName = vscode.window.activeTextEditor?.document.fileName

    new QuickOpener({
      initial: (activeFileName
        ? path.dirname(activeFileName)
        : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      ),
    }).show()
  },
  )

  context.subscriptions.push(disposable)
}

export function deactivate() {}
