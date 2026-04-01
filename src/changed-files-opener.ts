import * as vscode from 'vscode'
import { type FilePickItem, getButtonAction, type Opener } from './opener'
import { ACTIONS as QUICK_OPENER_ACTIONS } from './quick-opener'
import { getGitAPI, getRepository, listChangedFiles } from './utils'

/** Human-readable labels for git porcelain status codes. */
const STATUS_DESCRIPTIONS: Record<string, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  U: 'Unmerged',
  '?': 'Untracked',
  T: 'Type changed',
}

/** Actions available for the changed files picker */
export const ACTIONS = {
  openDiff: {
    iconPath: new vscode.ThemeIcon('compare-changes'),
    tooltip: 'Diff against HEAD',
  },
  openSplit: QUICK_OPENER_ACTIONS.openSplit,
} as const satisfies Record<string, vscode.QuickInputButton>

/** String union of all valid {@link ACTIONS} keys for {@link ChangedFilesOpener}. */
export type ActionId = keyof typeof ACTIONS
/** Union type of all available action button objects for {@link ChangedFilesOpener}. */
export type Action = (typeof ACTIONS)[ActionId]

/**
 * Quick picker listing all files modified, added, or untracked since the last commit.
 * - Default accept: open the selected file in the editor.
 * - Item button 1 (openDiff): diff the file against HEAD (hidden for untracked files).
 * - Item button 2 (openSplit): open the file in a split editor.
 */
export class ChangedFilesOpener implements Opener {
  readonly qp: vscode.QuickPick<FilePickItem>

  private icons: boolean
  private onDispose?: () => void

  constructor(options: { icons?: boolean; onDispose?: () => void } = {}) {
    this.icons = options.icons ?? true
    this.onDispose = options.onDispose

    this.qp = vscode.window.createQuickPick<FilePickItem>()
    this.qp.title = 'Open Changed File (since last commit)'
    this.qp.placeholder = 'Select a changed file to open…'
    this.qp.busy = true

    this.qp.onDidHide(() => this.dispose())
    this.qp.onDidAccept(() => {
      const item = this.qp.selectedItems[0]
      if (!item?.isError && item?.path) {
        this.openFile(item.path)
      }
      this.dispose()
    })
    this.qp.onDidTriggerItemButton((e: vscode.QuickPickItemButtonEvent<FilePickItem>) =>
      this.triggerItemAction(e.button as Action, e.item),
    )
  }

  /** Show the quick picker and start loading changed files. */
  show(): void {
    this.qp.show()
    this.updateItems()
  }

  /** Hide/discard the quick picker. */
  dispose(): void {
    this.onDispose?.()
    this.qp.dispose()
  }

  async updateItems(): Promise<void> {
    try {
      const api = await getGitAPI()
      const repo = getRepository(api)
      const files = await listChangedFiles(api.git.path, repo.rootUri.fsPath)

      if (files.length === 0) {
        this.qp.items = [
          {
            label: 'No changed files',
            detail: 'No modified or new files since last commit.',
            iconPath: this.icons ? new vscode.ThemeIcon('info') : undefined,
            isError: true,
          },
        ]
      } else {
        this.qp.items = files.map(f => {
          const absPath = vscode.Uri.joinPath(repo.rootUri, f.path).fsPath
          const isUntracked = f.statusCode === '?'
          return {
            label: f.path,
            description: STATUS_DESCRIPTIONS[f.statusCode] ?? f.statusCode,
            path: absPath,
            iconPath: this.icons ? vscode.ThemeIcon.File : undefined,
            resourceUri: vscode.Uri.file(absPath),
            buttons: isUntracked
              ? [ACTIONS.openSplit]
              : [ACTIONS.openDiff, ACTIONS.openSplit],
          }
        })
      }
    } catch (err: any) {
      this.qp.items = [
        {
          label: 'Error listing changed files',
          detail: err.message,
          iconPath: this.icons ? new vscode.ThemeIcon('alert') : undefined,
          isError: true,
        },
      ]
    } finally {
      this.qp.busy = false
    }
  }

  /** No title-level actions — required by the {@link Opener} interface. */
  triggerAction(_actionOrOffset: number | ActionId | Action): void {}

  /** Trigger an item button action for the given item. */
  async triggerItemAction(
    actionOrOffset: number | ActionId | Action,
    item = this.qp.activeItems[0],
  ): Promise<void> {
    if (!item?.path || item.isError) return
    const action = getButtonAction(actionOrOffset, item.buttons, ACTIONS)

    switch (action) {
      case ACTIONS.openDiff: {
        const api = await getGitAPI()
        const fileUri = vscode.Uri.file(item.path)
        const headUri = api.toGitUri(fileUri, 'HEAD')
        vscode.commands.executeCommand('vscode.diff', headUri, fileUri, `HEAD ↔ ${item.label}`)
        this.dispose()
        return
      }
      case ACTIONS.openSplit: {
        this.openFile(item.path, vscode.ViewColumn.Beside)
        this.dispose()
        return
      }
    }
  }

  private openFile(
    absPath: string,
    viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active,
  ): void {
    vscode.workspace
      .openTextDocument(vscode.Uri.file(absPath))
      .then((doc: vscode.TextDocument) => vscode.window.showTextDocument(doc, { viewColumn }))
  }
}
