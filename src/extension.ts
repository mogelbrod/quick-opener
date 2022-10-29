import * as vscode from 'vscode'
import * as path from 'path'
import { QuickOpener, updateContext, Action } from './quick-opener'
import { PathScanner } from './path-scanner'

/** Currently visible instance of plugin */
let instance: QuickOpener | null = null

export function activate(ctx: vscode.ExtensionContext) {
  // Initialize vscode context value
  updateContext(false)

  ctx.subscriptions.push(vscode.commands.registerCommand('quickOpener.show', () => {
    const config = vscode.workspace.getConfiguration('quickOpener')
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath

    // Attempt to rewrite virtual Git `/commit~sha/...` file paths to the original path
    const activeFileName = vscode.window.activeTextEditor?.document.fileName?.replace(
      new RegExp(`^${path.sep}commit~[0-9a-f]+${path.sep}`),
      (workspacePath || '') + path.sep
    )

    instance = new QuickOpener({
      // Only use dir of active file when it looks like a valid path
      initial: (activeFileName?.includes(path.sep)
        ? path.dirname(activeFileName)
        : workspacePath ?? config.get('fallbackDirectory') as string
      ),
      scanner: new PathScanner({
        exclude: config.get('exclude') as string[],
        maxCandidates: config.get('maxCandidates') as number,
        timeout: config.get('timeout') as number,
        dirTTL: 30e3,
      }),
      onDispose: () => {
        instance = null
      },
    })

    instance.show()
  }))

  ctx.subscriptions.push(
    vscode.commands.registerCommand('quickOpener.triggerAction', (
      actionOrOffset?: number | Action
    ) => {
      instance?.triggerAction(actionOrOffset ?? 1)
    })
  )

  ctx.subscriptions.push(
    vscode.commands.registerCommand('quickOpener.triggerItemAction', (
      actionOrOffset?: number | Action
    ) => {
      instance?.triggerItemAction(actionOrOffset ?? 1)
    })
  )

  ctx.subscriptions.push(
    vscode.commands.registerCommand('quickOpener.popPath', () =>
      instance?.popPath()
    ),
  )
}

export function deactivate() {}
