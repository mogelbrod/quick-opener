import * as path from 'path'
import * as vscode from 'vscode'
import { type Opener, setOpenerContext } from './opener'
import { PathScanner } from './path-scanner'
import { sepRegex } from './path-utils'
import { QuickOpener } from './quick-opener'
import { RevisionFileOpener } from './revision-file-opener'
import { RevisionOpener } from './revision-opener'
import { setGlobalState } from './utils'
import { variableExpansionFactory } from './variable-expansion'

/** Currently visible instance of plugin */
let instance: Opener | null = null

/** VS Code extension activation entry point – registers all commands. */
export function activate(ctx: vscode.ExtensionContext) {
  // Initialize vscode context value
  setOpenerContext(false)
  setGlobalState(ctx)

  const onDispose = () => {
    setOpenerContext(false)
    instance = null
  }

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

      instance = new QuickOpener({
        // Only use dir of active file when it looks like a valid path
        initial: activeFileName?.includes(path.sep)
          ? path.dirname(activeFileName)
          : (workspacePath ?? variableExpansion(config.get('fallbackDirectory') as string)),
        prefixes,
        icons: config.get('icons') as boolean,
        scanner: new PathScanner({
          exclude: config.get('exclude') as string[],
          maxCandidates: config.get('maxCandidates') as number,
          timeout: config.get('timeout') as number,
          dirTTL: 30e3,
        }),
        onDispose,
      })

      instance.show()
      setOpenerContext('quick')
    }),
  )

  ctx.subscriptions.push(
    vscode.commands.registerCommand('quickOpener.showRevisionPicker', options => {
      const icons = vscode.workspace.getConfiguration('quickOpener').get<boolean>('icons')
      instance = new RevisionOpener({
        icons,
        onAccept: ref => {
          instance = new RevisionFileOpener(ref, { icons, onDispose })
          instance.show()
        },
        ...options,
        onDispose,
      })
      instance.show()
      setOpenerContext('revision')
    }),
  )

  ctx.subscriptions.push(
    vscode.commands.registerCommand('quickOpener.showRevisionFilePicker', (inputRef, options) => {
      const icons = vscode.workspace.getConfiguration('quickOpener').get<boolean>('icons')
      instance = new RevisionFileOpener(inputRef, { icons, ...options, onDispose })
      instance.show()
      setOpenerContext('revision-file')
    }),
  )

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      'quickOpener.triggerAction',
      (actionOrOffset?: number | string) => {
        instance?.triggerAction(actionOrOffset ?? 1)
      },
    ),
  )

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      'quickOpener.triggerItemAction',
      (actionOrOffset?: number | string) => {
        instance?.triggerItemAction(actionOrOffset ?? 1)
      },
    ),
  )

  ctx.subscriptions.push(
    vscode.commands.registerCommand('quickOpener.popPath', () => {
      if (instance instanceof QuickOpener) instance.popPath()
    }),
  )

  ctx.subscriptions.push(
    vscode.commands.registerCommand('quickOpener.triggerTabCompletion', () => {
      if (instance instanceof QuickOpener) instance.triggerTabCompletion()
    }),
  )
}

/** VS Code extension deactivation hook. */
export function deactivate() {}
