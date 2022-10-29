import * as vscode from 'vscode'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { PathScanner, ScanEntry } from './path-scanner'
import * as putils from './path-utils'

export class QuickOpener {
  /** Quick pick instance */
  readonly qp = vscode.window.createQuickPick()

  /** Scanner instance */
  readonly scanner: PathScanner

  /** Callback triggered when opener is disposed */
  private onDispose?: () => void

  /** Current relative path - can be changed by user throughout the pick session */
  private relative: string

  /** Current vscode workspace paths */
  private workspacePaths: Set<string>

  /** OS User home directory */
  private readonly homePath = os.homedir()
  private readonly homePrefix = '~'

  constructor(options: {
    /** Starting directory */
    initial?: string,
    /** Scanner instance */
    scanner?: PathScanner,
    /** Callback triggered when opener is disposed */
    onDispose?: () => void,
  }) {
    this.updateRelative(options.initial || this.homePath, false)
    this.updateWorkspacePaths()
    this.onDispose = options.onDispose

    this.scanner = options.scanner ?? new PathScanner()

    this.qp.placeholder = 'Enter a relative or absolute path to open…'
    this.qp.onDidHide(this.dispose.bind(this))
    this.qp.onDidChangeValue(this.updateItems.bind(this))
    this.qp.onDidAccept(this.onAccept.bind(this))
    this.qp.onDidTriggerButton((button) => {
      return this.onAction(this.qp.value, button)
    })
    this.qp.onDidTriggerItemButton((event) => {
      return this.onAction(event.item.label, event.button)
    })
  }

  /** Show the quick picker */
  show() {
    updateContext(true)
    this.updateItems('')
    this.qp.show()
  }

  /** Hide/discard the quick picker */
  dispose() {
    updateContext(false)
    this.onDispose?.()
    this.qp.dispose()
  }

  /** Manually trigger an action */
  triggerAction(actionOrOffset: number | Action) {
    const action = typeof actionOrOffset === 'number'
      ? this.qp.buttons?.[actionOrOffset - 1]
      : ACTIONS[actionOrOffset]
    if (!action) {
      const actionStr = JSON.stringify(action)
      throw new Error(`Quick Opener: Expected valid action as argument (got '${actionStr}')`)
    }
    this.onAction(this.qp.value, action)
  }

  /** Manually trigger an item action */
  triggerItemAction(actionOrOffset: number | Action) {
    const selected = this.qp.activeItems[0]
    const action = typeof actionOrOffset === 'number'
      ? selected?.buttons?.[actionOrOffset - 1]
      : ACTIONS[actionOrOffset]
    if (action) {
      this.onAction(selected.label, action)
    }
  }

  popPath() {
    const { value } = this.qp
    if (value === '') {
      this.updateRelative(path.dirname(this.relative))
    } else {
      this.qp.value = putils.trimDirSuffix(value).includes(path.sep)
        ? putils.appendDirSuffix(path.dirname(value))
        : ''
    }
  }

  /** Change current relative path */
  updateRelative(absolutePath: string, updateItems = true) {
    this.relative = putils.appendDirSuffix(this.resolveRelative(absolutePath))
    this.qp.title = this.pathForDisplay(this.relative!, true)
    this.qp.value = ''
    if (updateItems) {
      this.qp.items = []
      this.updateItems(this.qp.value)
    }
    return this.relative
  }

  /** Regenerate cached list of workspace folders */
  updateWorkspacePaths() {
    return (this.workspacePaths = new Set(
      vscode.workspace.workspaceFolders?.map((x) => x.uri.fsPath) ?? [],
    ))
  }

  /** Update item list in response to input change */
  async updateItems(input: string) {
    try {
      const updateStart = Date.now()

      const inputParsed = path.parse(input)
      const inputAbsolute = this.resolveRelative(input)
      const inputIsDot = putils.isDot(input)
      const inputHasDirSuffix = putils.hasDirSuffix(input)
      const isAncestor = input.startsWith('..')
      const isAbsolute =
        inputParsed.root !== '' || input.startsWith(this.homePrefix)

      // console.log({ relative: this.relative, input, isAbsolute })

      // Immediately include ../ entry if not at root for quick navigation
      if (isAncestor && path.parse(this.relative).dir) {
        this.qp.items = [
          {
            label: putils.appendDirSuffix('..'),
            buttons: this.directoryButtons(path.resolve(this.relative, '..')),
          },
        ]
      }

      // Determine which buttons to show in quick pick titlebar
      // This shouldn't block list generation
      const windowButtonsPromise = this.scanner
        .isDirectory(inputAbsolute)
        .then((isDir) => {
          this.qp.buttons = isDir
            ? this.directoryButtons(inputAbsolute)
            : inputParsed.name && !inputIsDot
              ? [inputHasDirSuffix ? ACTIONS.createDirectory : ACTIONS.createFile]
              : []
        })

      // After this point the function latency may be noticeable
      const items: vscode.QuickPickItem[] = []

      let rootEntry: ScanEntry | undefined
      const rootDir =
        input.length && !inputHasDirSuffix && !isAncestor && !inputIsDot
          ? path.dirname(inputAbsolute)
          : inputAbsolute
      const rootParts = rootDir.split(path.sep)

      for (let i = rootParts.length; i > 0; i--) {
        const rootCandidate = rootParts.slice(0, i).join(path.sep)
        rootEntry = await this.scanner.scan(rootCandidate)
        // console.log(rootEntry.errored ? 'skipped' : 'chosen', rootCandidate)
        if (!rootEntry.errored) {
          break
        }
      }

      if (rootEntry) {
        const rootRelative = path.relative(this.relative, rootEntry.path)
        if (rootRelative !== '') {
          items.push({
            label: putils.appendDirSuffix(
              isAbsolute ? this.pathForDisplay(rootEntry.path) : rootRelative,
            ),
            buttons: this.directoryButtons(rootEntry.path),
          })
        }

        // Generate list of items from scan results
        this.scanner.forEach(rootEntry, (subpath, isDir) => {
          items.push({
            label:
              (isAbsolute
                ? this.pathForDisplay(subpath)
                : path.relative(this.relative, subpath)) +
              (isDir ? path.sep : ''),
            buttons: isDir
              ? this.directoryButtons(subpath)
              : putils.isWorkspaceFile(subpath)
                ? [ACTIONS.workspaceOpen, ACTIONS.openSplit]
                : [ACTIONS.openSplit],
          })
        })
      } else {
        console.warn('no root resolved from', inputAbsolute)
      }

      const updateDuration = Date.now() - updateStart
      console.log(`Generated ${items.length} items in ${updateDuration}ms`)
      this.qp.items = items

      // Wait for window buttons to be generated until we're considered done
      await windowButtonsPromise
    } catch (error: any) {
      this.qp.items = [
        {
          label: 'Error occurred',
          detail: error.message,
        },
      ]
    }
  }

  /** Handle quick pick accept events */
  async onAccept() {
    const input = this.qp.value
    const selected = this.qp.selectedItems[0]

    if (!selected) {
      return
    }

    const { label } = selected
    const target = this.resolveRelative(label)
    const stat = await fs.stat(target).catch(() => null)
    const uri = vscode.Uri.file(target)

    if (stat?.isDirectory()) {
      if (
        label === input ||
        // Immediately change directory if input points to ancestor for the sake of convenience
        (input === '..' && label === putils.appendDirSuffix(input))
      ) {
        this.updateRelative(target)
        return
      }

      this.qp.value = label
      return
    }

    vscode.workspace.openTextDocument(uri).then(vscode.window.showTextDocument)

    this.dispose()
  }

  /** Handle quick pick button and item button events */
  async onAction(value: string, button: vscode.QuickInputButton) {
    const target = this.resolveRelative(value)
    const stat = await fs.stat(target).catch(() => null)
    const uri = vscode.Uri.file(target)

    switch (button) {
      case ACTIONS.create:
      case ACTIONS.createDirectory:
      case ACTIONS.createFile: {
        const createDir = putils.hasDirSuffix(target) || button === ACTIONS.createDirectory
        if (!stat) {
          // TODO: Handle error thrown when creating directory at path of existing file
          await fs.mkdir(createDir ? target : path.dirname(target), {
            recursive: true,
          })
          if (!createDir) {
            await fs.appendFile(target, '')
          }
        }
        // Ensure any existing scan entry for the target is removed
        this.scanner.flushEntry(target)
        if (createDir) {
          this.updateRelative(target)
        } else {
          vscode.workspace
            .openTextDocument(vscode.Uri.file(target))
            .then(vscode.window.showTextDocument)
          this.dispose()
        }
        return
      }

      case ACTIONS.change: {
        this.updateRelative(path.join(this.relative, target))
        return
      }

      case ACTIONS.openSplit: {
        vscode.workspace.openTextDocument(vscode.Uri.file(target)).then((doc) =>
          vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.Beside,
          }),
        )
        this.dispose()
        return
      }

      case ACTIONS.openWindow: {
        this.dispose()
        await vscode.commands.executeCommand('vscode.openFolder', uri, {
          forceNewWindow: true,
        })
        return
      }

      case ACTIONS.workspaceOpen:
      case ACTIONS.workspaceAdd: {
        this.dispose()
        const existing = vscode.workspace.workspaceFolders
        if (button === ACTIONS.workspaceAdd && existing?.length) {
          vscode.workspace.updateWorkspaceFolders(existing.length, null, {
            uri,
          })
        } else {
          await vscode.commands.executeCommand('vscode.openFolder', uri)
        }
        this.updateWorkspacePaths()
        return
      }

      case ACTIONS.workspaceRemove: {
        this.dispose()
        const targetTrim = putils.trimDirSuffix(target)
        const existing = vscode.workspace.workspaceFolders
        const existingIndex = existing?.findIndex(
          (x) => x.uri.fsPath === targetTrim,
        )
        if (typeof existingIndex === 'number' && existingIndex !== -1) {
          vscode.workspace.updateWorkspaceFolders(existingIndex, 1)
          this.updateWorkspacePaths()
        }
      }
    }
  }

  /** Shorten an absolute path for display purposes */
  pathForDisplay(
    absolutePath: string,
    shorten = this.qp.value.includes(this.homePrefix),
  ) {
    return shorten
      ? absolutePath.replace(this.homePath, this.homePrefix)
      : absolutePath
  }

  /** Resolve an absolute/relative path, including those starting with ~/ */
  resolveRelative(pth: string) {
    const parts = pth.split(path.sep)
    if (parts[0] === this.homePrefix) {
      return path.join(this.homePath, ...parts.slice(1))
    }
    return this.relative && path.parse(pth).root === ''
      ? path.join(this.relative, pth)
      : pth
  }

  /** Generate buttons for a directory item */
  directoryButtons(absolutePath: string): vscode.QuickInputButton[] {
    return [
      this.workspacePaths.has(absolutePath)
        ? ACTIONS.workspaceRemove
        : ACTIONS.workspaceAdd,
      ACTIONS.openWindow,
    ]
  }
}

/** Manages vscode context value for plugin */
export function updateContext(enabled: boolean) {
  vscode.commands.executeCommand('setContext', 'inQuickOpener', enabled)
}

/** Actions available for quick pick window/items */
export const ACTIONS: Readonly<Record<string, vscode.QuickInputButton>> = {
  create: {
    tooltip: 'Create new file/directory using input as path',
    iconPath: new vscode.ThemeIcon('new-file'),
  },
  createFile: {
    tooltip: 'Create new file using input as path',
    iconPath: new vscode.ThemeIcon('new-file'),
  },
  createDirectory: {
    tooltip: 'Create new directory using input as path',
    iconPath: new vscode.ThemeIcon('new-folder'),
  },
  change: {
    tooltip: 'Change starting directory',
    iconPath: new vscode.ThemeIcon('arrow-right'),
  },
  openWindow: {
    tooltip: 'Open window',
    iconPath: new vscode.ThemeIcon('multiple-windows'),
  },
  openSplit: {
    tooltip: 'Open to the side',
    iconPath: new vscode.ThemeIcon('split-horizontal'),
  },
  workspaceOpen: {
    tooltip: 'Open workspace',
    iconPath: new vscode.ThemeIcon('root-folder'),
  },
  workspaceAdd: {
    tooltip: 'Add to workspace',
    iconPath: new vscode.ThemeIcon('root-folder-opened'),
  },
  workspaceRemove: {
    tooltip: 'Remove from workspace',
    iconPath: new vscode.ThemeIcon('close'),
  },
} as const

export type Action = keyof typeof ACTIONS
