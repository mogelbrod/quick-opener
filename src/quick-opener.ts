import * as vscode from 'vscode'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { PathScanner, ScanEntry } from './path-scanner'
import * as putils from './path-utils'

export class QuickOpener {
  public readonly qp = vscode.window.createQuickPick()
  public readonly scanner = new PathScanner()

  /** Current relative path - can be changed by user throughout the pick session */
  private relative: string

  /** Current vscode workspace paths */
  private workspacePaths: Set<string>

  /** OS User home directory */
  private readonly homePath = os.homedir()
  private readonly homePrefix = '~'

  constructor(options: { initial?: string }) {
    this.updateRelative(options.initial ?? this.homePath)
    this.updateWorkspacePaths()

    this.qp.title = 'Quick Opener'
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
  updateRelative(absolutePath: string) {
    this.relative = absolutePath
    this.qp.title = this.pathForDisplay(this.relative!, true)
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
    const updateStart = Date.now()

    const items: vscode.QuickPickItem[] = []

    const inputAbsolute = path.resolve(this.relative, input)
    const inputParsed = path.parse(input)
    const isAncestor = input.startsWith('..')
    const isAbsolute =
      inputParsed.root !== '' || input.startsWith(this.homePrefix)
    const baseName = path.basename(input)
    const baseNameIsDot = putils.isDot(baseName)
    const rootPath = isAbsolute
      ? this.resolveRelative(input)
      : isAncestor
        ? path.resolve(this.relative, input)
        : this.relative

    // console.log({ input, relative, rootPath, isAbsolute, isAncestor })

    this.qp.buttons =
      input === '' || putils.hasDirSuffix(input)
        ? this.directoryButtons(inputAbsolute)
        : baseName && !baseNameIsDot
          ? [BUTTONS.createFile]
          : []

    let rootEntry: ScanEntry | undefined = undefined
    const rootParts = rootPath.split(path.sep)

    for (let i = rootParts.length; i > 0; i--) {
      const rootCandidate = rootParts.slice(0, i).join(path.sep)
      rootEntry = await this.scanner.scan(rootCandidate, 100)
      // console.log(rootEntry.error ? 'skipped' : 'chosen', rootCandidate)
      if (!rootEntry.error) {
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
    }

    // Control inclusion of ~/ item in the list
    const homeLabel = this.homePrefix + path.sep
    if (input === this.homePrefix || input === homeLabel) {
      items.push({ label: homeLabel, alwaysShow: true })
    }

    const updateDuration = Date.now() - updateStart
    console.log(`Generated ${items.length} items in ${updateDuration}ms`)
    this.qp.items = items
  }

  /** Handles quick pick accept events */
  async onAccept() {
    const input = this.qp.value
    const selected = this.qp.selectedItems[0]

    if (!selected) {
      return
    }

    const label = selected.label
    const labelResolved = this.resolveRelative(label)

    const isDir = await fs
      .stat(labelResolved)
      .then((x) => x.isDirectory())
      .catch(() => false)

    console.log('accept', { input, inputResolved: labelResolved, label, isDir })

    if (isDir) {
      if (
        label === input ||
        // Immediately change directory if input points to ancestor for the sake of convenience
        (input === '..' && label === putils.appendDirSuffix(input))
      ) {
        this.updateRelative(labelResolved)
        this.qp.value = ''
        this.qp.items = []
        this.updateItems('')
        return
      }

      this.qp.value = label
      return
    }

    vscode.workspace
      .openTextDocument(vscode.Uri.file(labelResolved))
      .then(vscode.window.showTextDocument)

    this.qp.dispose()
  }

  /** Handle quick pick button and item button events */
  async onAction(value: string, button: vscode.QuickInputButton) {
    const target = this.resolveRelative(value)
    const uri = vscode.Uri.file(target)

    switch (button) {
      case BUTTONS.createFile: {
        const exists = await fs.stat(target)
          .then(() => true)
          .catch(() => false)
        if (!exists) {
          await fs.mkdir(path.dirname(target), { recursive: true })
          await fs.appendFile(target, '')
        }
        vscode.workspace
          .openTextDocument(vscode.Uri.file(target))
          .then(vscode.window.showTextDocument)
        this.qp.dispose()
        return
      }

      case BUTTONS.change: {
        this.updateRelative(path.join(this.relative, target))
        this.updateItems('')
        this.qp.value = ''
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
        vscode.workspace.updateWorkspaceFolders(
          existing !== undefined ? existing.length : 0,
          null,
          { uri },
        )
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
