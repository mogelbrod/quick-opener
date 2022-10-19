import * as vscode from 'vscode'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { PathScanner, ScanEntry } from './path-scanner'
import * as putils from './path-utils'

export class QuickOpener {
  /** Quick pick instance */
  public readonly qp = vscode.window.createQuickPick()

  /** Scanner instance */
  public readonly scanner: PathScanner

  /** Current relative path - can be changed by user throughout the pick session */
  private relative: string

  /** Current vscode workspace paths */
  private workspacePaths: Set<string>

  /** OS User home directory */
  private readonly homePath = os.homedir()
  private readonly homePrefix = '~'

  constructor(options: {
    initial?: string
    scanner?: PathScanner
  }) {
    this.updateRelative(options.initial ?? this.homePath, false)
    this.updateWorkspacePaths()

    this.scanner = options.scanner ?? new PathScanner()

    this.qp.placeholder = 'Enter a relative or absolute path to open…'
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
  public show() {
    this.updateItems('')
    this.qp.show()
  }

  /** Change current relative path */
  updateRelative(absolutePath: string, updateItems = true) {
    this.relative = absolutePath
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
      const isAbsolute = inputParsed.root !== '' || input.startsWith(this.homePrefix)

      // console.log({ relative: this.relative, input, isAbsolute })

      // Immediately include ../ entry if not at root for quick navigation
      if (isAncestor && path.parse(this.relative).dir) {
        this.qp.items = [{
          label: putils.appendDirSuffix('..'),
          buttons: this.directoryButtons(path.resolve(this.relative, '..')),
        }]
      }

      // Determine which buttons to show in quick pick titlebar
      // This shouldn't block list generation
      const windowButtonsPromise = this.scanner.isDirectory(inputAbsolute).then(isDir => {
        this.qp.buttons = isDir
          ? this.directoryButtons(inputAbsolute)
          : inputParsed.name && !inputIsDot
            ? [inputHasDirSuffix ? BUTTONS.createDirectory : BUTTONS.createFile]
            : []
      })

      // After this point the function latency may be noticeable
      const items: vscode.QuickPickItem[] = []

      let rootEntry: ScanEntry | undefined
      const rootDir = input.length && !inputHasDirSuffix && !isAncestor && !inputIsDot
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
            buttons: isDir ? this.directoryButtons(subpath) : FILE_BUTTONS,
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
      this.qp.items = [{
        label: 'Error occurred',
        detail: error.message,
      }]
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

    this.qp.dispose()
  }

  /** Handle quick pick button and item button events */
  async onAction(value: string, button: vscode.QuickInputButton) {
    const target = this.resolveRelative(value)
    const stat = await fs.stat(target).catch(() => null)
    const uri = vscode.Uri.file(target)

    debugger

    switch (button) {
      case BUTTONS.createDirectory:
      case BUTTONS.createFile: {
        const createFile = button === BUTTONS.createFile
        if (!stat) {
          await fs.mkdir(createFile ? path.dirname(target) : target, { recursive: true })
          if (createFile) {
            await fs.appendFile(target, '')
          }
        }
        if (createFile) {
          vscode.workspace
            .openTextDocument(vscode.Uri.file(target))
            .then(vscode.window.showTextDocument)
          this.qp.dispose()
        } else {
          this.updateRelative(target)
        }
        return
      }

      case BUTTONS.change: {
        this.updateRelative(path.join(this.relative, target))
        return
      }

      case BUTTONS.openSplit: {
        vscode.workspace
          .openTextDocument(vscode.Uri.file(target))
          .then((doc) =>
            vscode.window.showTextDocument(doc, {
              viewColumn: vscode.ViewColumn.Beside,
            }),
          )
        this.qp.dispose()
        return
      }

      case BUTTONS.openWindow: {
        this.qp.dispose()
        await vscode.commands.executeCommand('vscode.openFolder', uri, {
          forceNewWindow: true,
        })
        return
      }

      case BUTTONS.workspaceAdd: {
        this.qp.dispose()
        const existing = vscode.workspace.workspaceFolders
        if (existing?.length) {
          vscode.workspace.updateWorkspaceFolders(existing.length, null, { uri })
        } else {
          await vscode.commands.executeCommand('vscode.openFolder', uri)
        }
        this.updateWorkspacePaths()
        return
      }

      case BUTTONS.workspaceRemove: {
        this.qp.dispose()
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
    return path.parse(pth).root === '' ? path.join(this.relative, pth) : pth
  }

  /** Generate buttons for a directory item */
  directoryButtons(absolutePath: string): vscode.QuickInputButton[] {
    return [
      this.workspacePaths.has(absolutePath)
        ? BUTTONS.workspaceRemove
        : BUTTONS.workspaceAdd,
      BUTTONS.openWindow,
    ]
  }
}

/** Buttons available for quick pick window/items */
const BUTTONS: Readonly<Record<string, vscode.QuickInputButton>> = {
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
  workspaceAdd: {
    tooltip: 'Add to workspace',
    iconPath: new vscode.ThemeIcon('root-folder-opened'),
  },
  workspaceRemove: {
    tooltip: 'Remove from workspace',
    iconPath: new vscode.ThemeIcon('close'),
  },
} as const

/** Buttons are displayed in reverse order compared to qp.buttons */
const FILE_BUTTONS: vscode.QuickPickItem['buttons'] = [
  BUTTONS.openSplit,
] as const
