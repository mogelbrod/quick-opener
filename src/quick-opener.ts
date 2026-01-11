import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import * as putils from './path-utils'
import type { ScanEntry, ScannerBase } from './scanner'

export class QuickOpener {
  /** Quick pick instance */
  readonly qp = vscode.window.createQuickPick()

  /** Scanner instance */
  readonly scanner: ScannerBase

  /** Available path prefixes (prefix => substitution without /)*/
  readonly prefixes: Record<string, string>
  /** Keys of `prefixes` */
  readonly prefixesArray: string[]

  /** Show icons in quick picker */
  readonly icons: boolean

  /** Callback triggered when opener is disposed */
  private onDispose?: () => void

  /** Current relative path - can be changed by user throughout the pick session */
  private relative!: string

  /** Current vscode workspace paths */
  private workspacePaths!: Set<string>

  /** Monotonically increasing counter for updateItems calls */
  private updateCounter = 0

  constructor(options: {
    /** Scanner instance */
    scanner: ScannerBase
    /** Starting directory */
    initial?: string
    /** Available path prefixes */
    prefixes?: Record<string, string>
    /** Show icons in quick picker */
    icons?: boolean
    /** Callback triggered when opener is disposed */
    onDispose?: () => void
  }) {
    this.scanner = options.scanner
    this.prefixes = Object.assign({}, options.prefixes)
    this.prefixesArray = Object.keys(this.prefixes)
    this.prefixesArray.forEach(p => {
      this.prefixes[p] = putils.trimDirSuffix(this.prefixes[p])
    })
    this.icons = options.icons ?? true
    this.onDispose = options.onDispose

    this.updateRelative(options.initial || os.homedir())
    this.updateWorkspacePaths()

    this.qp.placeholder = 'Enter a relative or absolute path to open…'
    this.qp.onDidHide(this.dispose.bind(this))
    this.qp.onDidChangeValue(this.updateItems.bind(this))
    this.qp.onDidAccept(this.onAccept.bind(this))
    this.qp.onDidTriggerButton(button => {
      return this.onAction(this.qp.value, button)
    })
    this.qp.onDidTriggerItemButton(event => {
      return this.onAction(event.item.label, event.button)
    })
  }

  /** Show the quick picker */
  show() {
    updateContext(true)
    this.updateItems()
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
    const action =
      typeof actionOrOffset === 'number'
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
    const action =
      typeof actionOrOffset === 'number'
        ? selected?.buttons?.[actionOrOffset - 1]
        : ACTIONS[actionOrOffset]
    if (action) {
      this.onAction(selected.label, action)
    }
  }

  /** Pop last segment of the input, or navigate to relative parent directory if input is empty */
  popPath() {
    const { value } = this.qp
    if (value === '') {
      this.updateRelative(path.dirname(this.relative))
      this.updateItems()
    } else {
      const sep = path.sep
      this.qp.value = putils.trimDirSuffix(value).includes(sep)
        ? putils.appendDirSuffix(path.dirname(value))
        : ''
    }
  }

  /** Replace the input with the value of the active item, if any */
  triggerTabCompletion() {
    const selected = this.qp.activeItems[0]
    if (selected) {
      this.qp.value = selected.label
    }
  }

  /** Change current relative path */
  updateRelative(absolutePath: string) {
    this.relative = putils.appendDirSuffix(this.resolveRelative(absolutePath))
    this.qp.title = this.relative
    this.qp.value = ''
    return this.relative
  }

  /** Regenerate cached list of workspace folders */
  updateWorkspacePaths() {
    return (this.workspacePaths = new Set(
      vscode.workspace.workspaceFolders?.map(x => x.uri.fsPath) ?? [],
    ))
  }

  /** Update item list in response to input change */
  async updateItems() {
    const input = this.qp.value
    const updateId = ++this.updateCounter

    try {
      const updateStart = Date.now()

      const inputParsed = path.parse(input)
      const inputAbsolute = this.resolveRelative(input)
      const sep = path.sep
      const inputPrefix = this.prefixesArray.find(p => {
        return input === p || input.startsWith(p + sep)
      })
      const inputPrefixAbsolute = inputPrefix && this.prefixes[inputPrefix]
      const isDotPath = putils.isDot(input)
      const isAncestor = input.startsWith('..')
      const isAbsolute = inputParsed.root !== '' || !!inputPrefix
      const hasDirSuffix = putils.hasDirSuffix(input)

      const items: vscode.QuickPickItem[] = []

      // Immediately include specific entries when likely desired
      if (inputPrefix && input === inputPrefix && inputPrefixAbsolute) {
        // Include matching prefix
        items.push({
          ...this.generateItem(putils.appendDirSuffix(inputPrefix), inputPrefixAbsolute, false),
          alwaysShow: true,
        })
        this.qp.items = items
      } else if (isAncestor && path.parse(this.relative).dir) {
        // Include '../' if not at root for quick navigation
        // Don't include it in `items` as the scan will also include it
        const parentPath = path.resolve(this.relative, '..')
        this.qp.items = [this.generateItem(putils.appendDirSuffix('..'), parentPath, false)]
      }

      // Determine which buttons to show in quick pick titlebar
      // This shouldn't block list generation
      const windowButtonsPromise = this.scanner.isDirectory(inputAbsolute).then(isDir => {
        if (updateId !== this.updateCounter) {
          return
        }
        this.qp.buttons = isDir
          ? this.directoryButtons(inputAbsolute)
          : inputParsed.name && !isDotPath
            ? [hasDirSuffix ? ACTIONS.createDirectory : ACTIONS.createFile]
            : []
      })

      // After this point the function latency may be noticeable

      let rootEntry: ScanEntry | undefined
      const rootDir =
        input.length && !hasDirSuffix && !isAncestor && !isDotPath
          ? path.dirname(inputAbsolute)
          : inputAbsolute
      const rootParts = rootDir.split(sep)

      for (let i = rootParts.length; i > 0; i--) {
        const rootCandidate = rootParts.slice(0, i).join(sep)
        rootEntry = await this.scanner.scan(rootCandidate)
        if (updateId !== this.updateCounter) {
          return
        }
        // console.log(rootEntry.errored ? 'skipped' : 'chosen', rootCandidate)
        if (!rootEntry.errored) {
          break
        }
      }

      if (rootEntry) {
        const rootRelative = path.relative(this.relative, rootEntry.path)
        const seenPaths = new Set<string>()

        if (rootRelative !== '') {
          const rootPath = putils.appendDirSuffix(
            isAbsolute ? this.pathForDisplay(rootEntry.path, inputPrefix) : rootRelative,
          )
          seenPaths.add(rootPath)
          items.push(this.generateItem(rootPath, rootEntry.path, false))
        }

        // Generate list of items from scan results
        this.scanner.forEach(rootEntry, (subpath, isDir) => {
          const displayPath = isAbsolute
            ? this.pathForDisplay(subpath, inputPrefix)
            : path.relative(this.relative, subpath)
          const label = isDir ? displayPath + path.sep : displayPath

          // Skip duplicates
          if (seenPaths.has(label)) {
            return
          }
          seenPaths.add(label)

          items.push(this.generateItem(label, subpath, !isDir))
        })
      } else {
        console.warn('no root resolved from', inputAbsolute)
      }

      // Only update if this is still the latest request
      if (updateId !== this.updateCounter) {
        return
      }

      const updateDuration = Date.now() - updateStart
      console.log(`Generated ${items.length} items in ${updateDuration}ms`)
      this.qp.items = items

      // Wait for window buttons to be generated until we're considered done
      await windowButtonsPromise
    } catch (error: any) {
      if (updateId !== this.updateCounter) {
        return
      }
      this.qp.items = [
        {
          label: 'Error occurred',
          detail: error.message,
          iconPath: new vscode.ThemeIcon('alert'),
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

    vscode.workspace.openTextDocument(uri).then(vscode.window.showTextDocument, error => {
      vscode.window.showErrorMessage(error.message)
    })

    this.dispose()
  }

  /** Handle quick pick button and item button events */
  async onAction(value: string, button: vscode.QuickInputButton) {
    const target = this.resolveRelative(value)
    const stat = await fs.stat(target).catch(() => null)
    const uri = vscode.Uri.file(target)
    console.log(`Executing action`, { value, target })

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
          console.log(`Created ${createDir ? 'directory' : 'file'} ${target}`)
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
        vscode.workspace.openTextDocument(vscode.Uri.file(target)).then(doc =>
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
        const existingIndex = existing?.findIndex(x => x.uri.fsPath === targetTrim)
        if (typeof existingIndex === 'number' && existingIndex !== -1) {
          vscode.workspace.updateWorkspaceFolders(existingIndex, 1)
          this.updateWorkspacePaths()
        }
      }
    }
  }

  /** Shorten an absolute path for display purposes */
  pathForDisplay(absolutePath: string, prefix?: string) {
    const prefixAbsolute = !!prefix && this.prefixes[prefix]
    return prefixAbsolute && absolutePath.startsWith(prefixAbsolute)
      ? absolutePath.replace(prefixAbsolute, prefix)
      : absolutePath
  }

  /** Resolve an absolute/relative path, expanding prefix if present */
  resolveRelative(pth: string) {
    const parts = pth.split(path.sep)
    const prefix = this.prefixesArray.find(p => parts[0] === p)
    if (prefix && parts.length > 1) {
      return path.join(this.prefixes[prefix], parts.slice(1).join(path.sep))
    }
    return this.relative && path.parse(pth).root === '' ? path.join(this.relative, pth) : pth
  }

  /** Generate buttons for a directory item */
  directoryButtons(absolutePath: string): readonly vscode.QuickInputButton[] {
    return this.workspacePaths.has(absolutePath) ? BUTTON_COMBOS.workspaceDir : BUTTON_COMBOS.dir
  }

  /** Generate a quick pick item */
  generateItem(
    /** Label displayed to user in quick picker */
    label: string,
    /** Path which the item represents */
    path: string,
    /** Does the path correspond to a file? */
    isFile: boolean,
    /** Pass `true` for default button for given path, or override. */
    buttons: boolean | readonly vscode.QuickInputButton[] = true,
  ): vscode.QuickPickItem {
    const buttonArray =
      buttons === false
        ? undefined
        : buttons === true
          ? isFile
            ? putils.isWorkspaceFile(path)
              ? BUTTON_COMBOS.workspaceFile
              : BUTTON_COMBOS.file
            : this.directoryButtons(path)
          : buttons

    return {
      label,
      description: ' ',
      iconPath: this.icons ? (isFile ? vscode.ThemeIcon.File : vscode.ThemeIcon.Folder) : undefined,
      resourceUri: vscode.Uri.file(path),
      buttons: buttonArray,
    }
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

/** Reusable {@link ACTIONS} combinations */
const BUTTON_COMBOS = {
  workspaceFile: [ACTIONS.workspaceOpen, ACTIONS.openSplit] as const,
  workspaceDir: [ACTIONS.workspaceRemove, ACTIONS.openWindow] as const,
  file: [ACTIONS.openSplit] as const,
  dir: [ACTIONS.workspaceAdd, ACTIONS.openWindow] as const,
} as const
