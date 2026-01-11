import * as path from 'path'
import * as vscode from 'vscode'
import { sepRegex } from './path-utils'
import { type Action, QuickOpener, updateContext } from './quick-opener'
import { isRipgrepAvailable, ReaddirScanner, RipgrepScanner } from './scanner'
import { variableExpansionFactory } from './variable-expansion'

/** Currently visible instance of plugin */
let instance: QuickOpener | null = null

export function activate(ctx: vscode.ExtensionContext) {
  // Initialize vscode context value
  updateContext(false)

  ctx.subscriptions.push(
    vscode.commands.registerCommand('quickOpener.show', () => {
      const config = vscode.workspace.getConfiguration('quickOpener')
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      const document = vscode.window.activeTextEditor?.document

      // Attempt to rewrite virtual Git `/commit~sha/...` file paths to the original path
      const activeFileName = document?.fileName?.replace(
        new RegExp(`^${sepRegex}commit~[0-9a-f]+${sepRegex}`),
        () => {
          let root = workspacePath || ''
          try {
            const query = JSON.parse(document.uri.query)
            if (query?.rootPath) {
              root = query.rootPath
            }
          } catch (error) {
            console.log('Encountered /commit~sha/... file path without valid query', error)
          }
          return root + path.sep
        },
      )

      const variableExpansion = variableExpansionFactory()
      const prefixes = Object.fromEntries(
        Object.entries(config.get('prefixes') || {}).map(([k, v]) => [k, variableExpansion(v)]),
      )

      const ScannerClass =
        (config.get('ripgrep') as boolean) && isRipgrepAvailable() ? RipgrepScanner : ReaddirScanner

      instance = new QuickOpener({
        // Only use dir of active file when it looks like a valid path
        initial: activeFileName?.includes(path.sep)
          ? path.dirname(activeFileName)
          : (workspacePath ?? variableExpansion(config.get('fallbackDirectory') as string)),
        prefixes,
        icons: config.get('icons') as boolean,
        scanner: new ScannerClass({
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
    }),
  )

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      'quickOpener.triggerAction',
      (actionOrOffset?: number | Action) => {
        instance?.triggerAction(actionOrOffset ?? 1)
      },
    ),
  )

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      'quickOpener.triggerItemAction',
      (actionOrOffset?: number | Action) => {
        instance?.triggerItemAction(actionOrOffset ?? 1)
      },
    ),
  )

  ctx.subscriptions.push(
    vscode.commands.registerCommand('quickOpener.popPath', () => instance?.popPath()),
  )

  ctx.subscriptions.push(
    vscode.commands.registerCommand('quickOpener.triggerTabCompletion', () =>
      instance?.triggerTabCompletion(),
    ),
  )
}

export function deactivate() {}
