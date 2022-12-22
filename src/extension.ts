import * as vscode from 'vscode'
import * as path from 'path'
import { QuickOpener, updateContext, Action } from './quick-opener'
import { PathScanner } from './path-scanner'
import { sepRegex } from './path-utils'

/** Currently visible instance of plugin */
let instance: QuickOpener | null = null

export function activate(ctx: vscode.ExtensionContext) {
  // Initialize vscode context value
  updateContext(false)

  ctx.subscriptions.push(vscode.commands.registerCommand('quickOpener.show', () => {
    const config = vscode.workspace.getConfiguration('quickOpener')
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    const document = vscode.window.activeTextEditor?.document

    // Attempt to rewrite virtual Git `/commit~sha/...` file paths to the original path
    const activeFileName = document?.fileName?.replace(
      new RegExp(`^${sepRegex}commit~[0-9a-f]+${sepRegex}`),
      () => {
        let root = (workspacePath || '')
        try {
          const query = JSON.parse(document.uri.query)
          if (query?.rootPath) {
            root = query.rootPath
          }
        } catch (error) {
          console.log('Encountered /commit~sha/... file path without valid query', error)
        }
        return root + path.sep
      }
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

  ctx.subscriptions.push(
    vscode.commands.registerCommand('quickOpener.triggerTabCompletion', () =>
      instance?.triggerTabCompletion()
    ),
  )
}

export function deactivate() {}
