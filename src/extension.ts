import * as vscode from 'vscode'
import * as path from 'path'
import { QuickOpener } from './quick-opener'
import { PathScanner } from './path-scanner'

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('quickOpener.show', () => {
    const activeFileName = vscode.window.activeTextEditor?.document.fileName
    const config = vscode.workspace.getConfiguration('quickOpener')

    const opener = new QuickOpener({
      initial: (activeFileName
        ? path.dirname(activeFileName)
        : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      ),
      scanner: new PathScanner({
        exclude: config.get('exclude') as string[],
        maxCandidates: config.get('maxCandidates') as number,
        timeout: config.get('timeout') as number,
        dirTTL: 30e3,
      }),
    })

    opener.show()
  },
  )

  context.subscriptions.push(disposable)
}

export function deactivate() {}
