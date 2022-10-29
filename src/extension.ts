import * as vscode from 'vscode'
import * as path from 'path'
import { QuickOpener } from './quick-opener'
import { PathScanner } from './path-scanner'

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('quickOpener.show', () => {
    const config = vscode.workspace.getConfiguration('quickOpener')
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath

    // Attempt to rewrite virtual Git `/commit~sha/...` file paths to the original path
    const activeFileName = vscode.window.activeTextEditor?.document.fileName.replace(
      new RegExp(`^${path.sep}commit~[0-9a-f]+${path.sep}`),
      (workspacePath || '') + path.sep
    )

    const opener = new QuickOpener({
      initial: (activeFileName
        ? path.dirname(activeFileName)
        : workspacePath ?? config.get('fallbackDirectory') as string
      ),
      scanner: new PathScanner({
        exclude: config.get('exclude') as string[],
        maxCandidates: config.get('maxCandidates') as number,
        timeout: config.get('timeout') as number,
        dirTTL: 30e3,
      }),
    })

    opener.show()
  })

  context.subscriptions.push(disposable)
}

export function deactivate() {}
