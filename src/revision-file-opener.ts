import * as vscode from 'vscode'
import type { Ref } from './git'
import { type FilePickItem, getButtonAction, type Opener } from './opener'
import { BUTTON_COMBOS, ACTIONS as QUICK_OPENER_ACTIONS } from './quick-opener'
import {
  formatRef,
  getGitAPI,
  getRepository,
  listFilesAtRef,
  openDiffBetween,
  toRef,
} from './utils'

/** Actions available for quick pick window/items */
export const ACTIONS = {
  openDiff: {
    iconPath: new vscode.ThemeIcon('compare-changes'),
    tooltip: 'Diff against HEAD',
  },
  openChanges: {
    iconPath: new vscode.ThemeIcon('request-changes'),
    tooltip: 'Open changes',
  },
  openSplit: QUICK_OPENER_ACTIONS.openSplit,
} as const satisfies Record<string, vscode.QuickInputButton>

/** String union of all valid {@link ACTIONS} keys for {@link RevisionFileOpener}. */
export type ActionId = keyof typeof ACTIONS
/** Union type of all available action button objects for {@link RevisionFileOpener}. */
export type Action = (typeof ACTIONS)[ActionId]

/**
 * Quick picker listing all files that exist at a given git ref.
 * Title buttons mirror the item buttons from {@link RevisionOpener}:
 * - Button 1 (openChangesButton): show changes introduced by this ref vs its parent
 * - Button 2 (openDiffButton): diff this ref against HEAD
 */
export class RevisionFileOpener implements Opener {
  readonly qp: vscode.QuickPick<FilePickItem>

  private ref: Ref & { name: string; commit: string }
  private onDispose?: () => void

  constructor(
    inputRef: string | Ref,
    options: {
      initialValue?: string
      onDispose?: () => void
    } = {},
  ) {
    this.ref = toRef(inputRef)
    this.onDispose = options.onDispose

    this.qp = vscode.window.createQuickPick<FilePickItem>()
    this.qp.title = `Open file from ${formatRef(this.ref)}`
    this.qp.placeholder = 'Select a file…'
    this.qp.busy = true
    this.qp.buttons = [ACTIONS.openChanges, ACTIONS.openDiff]

    if (options.initialValue !== undefined) {
      this.qp.value = options.initialValue
    }

    this.qp.onDidHide(() => this.dispose())
    this.qp.onDidAccept(() => {
      this.openItem(this.qp.selectedItems[0])
      this.dispose()
    })
    this.qp.onDidTriggerButton(b => this.triggerAction(b as Action))
    this.qp.onDidTriggerItemButton(e => this.triggerItemAction(e.button as Action, e.item))
  }

  show(): void {
    if (!this.ref.commit) {
      vscode.window.showErrorMessage('Quick Opener: Missing required git ref.')
      return void this.dispose()
    }
    this.qp.show()
    this.updateItems()
  }

  /** Hide/discard the quick picker */
  dispose(): void {
    this.onDispose?.()
    this.qp.dispose()
  }

  async updateItems(): Promise<void> {
    try {
      const api = await getGitAPI()
      const repo = getRepository(api)

      const files = await listFilesAtRef(api.git.path, repo.rootUri.fsPath, this.ref.commit)
      this.qp.items = files.map(f => ({
        label: f,
        description: '',
        path: f,
        iconPath: vscode.ThemeIcon.File,
        resourceUri: vscode.Uri.file(vscode.Uri.joinPath(repo.rootUri, f).fsPath),
        buttons: BUTTON_COMBOS.file,
      }))
    } catch (err: any) {
      this.qp.items = [
        {
          label: 'Error listing files',
          detail: err.message,
          iconPath: new vscode.ThemeIcon('alert'),
          isError: true,
        },
      ]
    } finally {
      this.qp.busy = false
    }
  }

  /** Manually trigger a title button action */
  async triggerAction(actionOrOffset: number | ActionId | Action): Promise<void> {
    const action = getButtonAction(actionOrOffset, this.qp.buttons, ACTIONS)

    switch (action) {
      case ACTIONS.openDiff:
        openDiffBetween(this.ref, toRef('HEAD'))
        return void this.dispose()
      case ACTIONS.openChanges: {
        const repo = getRepository(await getGitAPI())
        const title = formatRef(this.ref)
        const commit = await repo.getCommit(this.ref.commit)
        const parent = commit.parents[0]
        if (!parent) {
          vscode.window.showInformationMessage(`${title} has no parent commit.`)
          return
        }
        openDiffBetween(toRef({ commit: parent }), this.ref)
        return void this.dispose()
      }
    }

    vscode.window.showErrorMessage('Quick Opener: Unknown action')
  }

  /** Manually trigger an item action */
  triggerItemAction(
    actionOrOffset: number | ActionId | Action,
    item = this.qp.activeItems[0],
  ): void {
    const action = getButtonAction(actionOrOffset, item.buttons, ACTIONS)

    switch (action) {
      case ACTIONS.openSplit: {
        this.openItem(item, vscode.ViewColumn.Beside)
        return void this.qp.hide()
      }
    }

    vscode.window.showErrorMessage('Quick Opener: Unknown item action')
  }

  private async openItem(
    item: FilePickItem | undefined,
    viewColumn = vscode.ViewColumn.Active,
  ): Promise<void> {
    if (!item || item.isError || !item.path) return
    const api = await getGitAPI()
    const repo = getRepository(api)
    const uri = api.toGitUri(
      vscode.Uri.joinPath(repo.rootUri, item.path!),
      this.ref.name || this.ref.commit,
    )
    vscode.workspace.openTextDocument(uri).then(
      doc => vscode.window.showTextDocument(doc, { viewColumn }),
      err => vscode.window.showErrorMessage(err.message),
    )
  }
}
