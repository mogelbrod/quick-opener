import * as path from 'path'
import * as vscode from 'vscode'
import { type Opener, setOpenerContext } from './opener'
import { PathScanner } from './path-scanner'
import { sepRegex } from './path-utils'
import { QuickOpener } from './quick-opener'
import { RevisionFileOpener } from './revision-file-opener'
import { RevisionOpener } from './revision-opener'
import { openFileRevision, setGlobalState } from './utils'
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
    }),
  )

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      'quickOpener.showRevisionPicker',
      ({
        // biome-ignore lint/suspicious/noTemplateCurlyInString: Intentional
        file = '${relativeFile}',
        skipFileSelection = false,
        filterByStatus,
        ...options
      }: ConstructorParameters<typeof RevisionOpener>[0] & {
        file?: string
        skipFileSelection?: boolean
        /** Forwarded to {@link RevisionFileOpener} */
        filterByStatus?: string
      } = {}) => {
        const icons = vscode.workspace.getConfiguration('quickOpener').get<boolean>('icons')
        const expandVariables = variableExpansionFactory()
        const filePath = expandVariables(file)
        instance = new RevisionOpener({
          icons,
          path: skipFileSelection ? filePath : undefined,
          onAccept: async ref => {
            if (skipFileSelection && filePath) {
              try {
                await openFileRevision(filePath, ref)
                return
              } catch {
                console.warn('Failed to open file from revision, falling back to file picker')
              }
            }
            instance = new RevisionFileOpener({
              ref,
              icons,
              initialValue: filePath,
              filterByStatus,
              onDispose,
            })
            instance.show()
          },
          ...options,
          initialValue: expandVariables(options.initialValue || ''),
          onDispose,
        })
        instance.show()
      },
    ),
  )

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      'quickOpener.showRevisionFilePicker',
      (options: ConstructorParameters<typeof RevisionFileOpener>[0] = {}) => {
        const icons = vscode.workspace.getConfiguration('quickOpener').get<boolean>('icons')
        const expandVariables = variableExpansionFactory()
        instance = new RevisionFileOpener({
          icons,
          ...options,
          ref: typeof options.ref === 'string' ? expandVariables(options.ref) : options.ref,
          initialValue: expandVariables(options?.initialValue || ''),
          onDispose,
        })
        instance.show()
      },
    ),
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
