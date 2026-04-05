import * as vscode from 'vscode'
import type { Ref } from './git'
import {
  type FilePickItem,
  getButtonAction,
  type InputButton,
  type Opener,
  setOpenerContext,
} from './opener'
import { ACTIONS as QUICK_OPENER_ACTIONS } from './quick-opener'
import {
  ALL_GIT_STATUSES,
  formatRef,
  getGitAPI,
  getRepository,
  listChangedFilesAtRef,
  listChangedFilesInWorkingTree,
  listFilesAtRef,
  openDiffBetween,
  openFileRevision,
  toRef,
  WORKING_TREE_REF,
} from './utils'

/**
 * Actions available for quick pick window/items.
 * Toggled buttons use icons that represent the current (opposite) state.
 */
export const ACTIONS = {
  toggleChangedOff: {
    id: 'toggleChanged',
    iconPath: new vscode.ThemeIcon('filter-filled'),
    tooltip: 'Switch to show all files',
  },
  toggleChangedOn: {
    id: 'toggleChanged',
    iconPath: new vscode.ThemeIcon('filter'),
    tooltip: 'Switch to only show changed files',
  },
  openDiff: {
    id: 'openDiff',
    iconPath: new vscode.ThemeIcon('compare-changes'),
    tooltip: 'Diff against HEAD',
  },
  openChanges: {
    id: 'openChanges',
    iconPath: new vscode.ThemeIcon('request-changes'),
    tooltip: 'Open changes',
  },
  openSplit: QUICK_OPENER_ACTIONS.openSplit,
} as const satisfies Record<string, InputButton>

/** String union of all valid {@link ACTIONS} keys for {@link RevisionFileOpener}. */
export type ActionId = keyof typeof ACTIONS
/** Union type of all available action button objects for {@link RevisionFileOpener}. */
export type Action = (typeof ACTIONS)[ActionId]

const FILE_BUTTONS = [ACTIONS.openSplit, ACTIONS.openChanges, ACTIONS.openDiff] as const

const GIT_DIFF_STATUS_PRESENTATION = {
  A: { name: 'Added', icon: new vscode.ThemeIcon('diff-added') },
  C: { name: 'Copied', icon: new vscode.ThemeIcon('copy') },
  D: { name: 'Deleted', icon: new vscode.ThemeIcon('diff-removed') },
  M: { name: 'Modified', icon: new vscode.ThemeIcon('diff-modified') },
  R: { name: 'Renamed', icon: new vscode.ThemeIcon('diff-renamed') },
  T: { name: 'Type Change', icon: new vscode.ThemeIcon('file-symlink-file') },
} as const satisfies Record<string, { name: string; icon: vscode.ThemeIcon }>

/**
 * Quick picker listing files that exist at a given git ref.
 * Title buttons mirror the item buttons from {@link RevisionOpener}:
 * - Button 1 (openChangesButton): show changes introduced by this ref vs its parent
 * - Button 2 (openDiffButton): diff this ref against HEAD
 */
export class RevisionFileOpener implements Opener {
  readonly qp: vscode.QuickPick<FilePickItem>

  private ref: Ref & { name: string; commit: string }
  private icons: boolean
  private applyFilter!: boolean
  private filterByStatus: string | undefined
  private onDispose?: () => void

  constructor(
    options: {
      ref?: string | Ref
      initialValue?: string
      icons?: boolean
      /**
       * When set, only files whose git diff-tree status letter appears in this string are shown.
       * Supported letters: A (added), C (copied), D (deleted), M (modified), R (renamed), T (type change).
       * Example: `'AM'` shows only added and modified files.
       * When omitted, all files at the ref are shown.
       * Specify `true` to filter by any changes.
       */
      filterByStatus?: string | true
      onDispose?: () => void
    } = {},
  ) {
    this.ref = toRef(options.ref || WORKING_TREE_REF)
    this.icons = options.icons ?? true
    this.onDispose = options.onDispose

    this.qp = vscode.window.createQuickPick<FilePickItem>()
    this.qp.title = `Open file from ${formatRef(this.ref)}`
    this.qp.placeholder = 'Select a file…'
    this.qp.busy = true
    this.filterByStatus =
      options.filterByStatus === true
        ? ALL_GIT_STATUSES
        : (options.filterByStatus || ALL_GIT_STATUSES).toUpperCase()
    this.updateButtons(!!options.filterByStatus)

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

  /** Whether the current ref represents the working tree "ref". */
  get isWorkingTree(): boolean {
    return this.ref === WORKING_TREE_REF
  }

  /** Show the quick picker and start loading files for the configured ref. */
  show(): void {
    if (!this.ref.commit) {
      vscode.window.showErrorMessage('Quick Opener: Missing required git ref.')
      return void this.dispose()
    }
    this.qp.show()
    this.updateItems()
    setOpenerContext('revision-file')
  }

  /** Hide/discard the quick picker */
  dispose(): void {
    this.onDispose?.()
    this.qp.dispose()
  }

  /** Reload the file list from git and refresh the quick pick items. */
  async updateItems(): Promise<void> {
    try {
      const api = await getGitAPI()
      const repo = getRepository(api)
      const { isWorkingTree } = this
      const filterByStatus = this.applyFilter ? this.filterByStatus : undefined

      if (isWorkingTree || filterByStatus) {
        const results = isWorkingTree
          ? await listChangedFilesInWorkingTree(api, filterByStatus)
          : await listChangedFilesAtRef(api, this.ref.commit, filterByStatus)
        const items: FilePickItem[] = []
        for (const [path, status] of results) {
          const presentation =
            GIT_DIFF_STATUS_PRESENTATION[status as keyof typeof GIT_DIFF_STATUS_PRESENTATION]
          items.push({
            label: path,
            description: presentation?.name,
            path,
            iconPath: this.icons ? vscode.ThemeIcon.File : undefined,
            resourceUri: vscode.Uri.file(vscode.Uri.joinPath(repo.rootUri, path).fsPath),
            buttons: FILE_BUTTONS,
          })
        }
        this.qp.items = items
      } else {
        const results = await listFilesAtRef(api, this.ref.commit)
        this.qp.items = results.map(f => ({
          label: f,
          description: '',
          path: f,
          iconPath: this.icons ? vscode.ThemeIcon.File : undefined,
          resourceUri: vscode.Uri.file(vscode.Uri.joinPath(repo.rootUri, f).fsPath),
          buttons: FILE_BUTTONS,
        }))
      }
    } catch (err: any) {
      this.qp.items = [
        {
          label: 'Error listing files',
          detail: err.message,
          iconPath: this.icons ? new vscode.ThemeIcon('alert') : undefined,
          isError: true,
        },
      ]
    } finally {
      this.qp.busy = false
    }
  }

  /** Refresh the title bar buttons based on the current filter state. */
  updateButtons(applyFilter = !this.applyFilter): void {
    this.applyFilter = applyFilter
    const buttons: InputButton[] = [ACTIONS.openChanges, ACTIONS.openDiff]
    if (!this.isWorkingTree) {
      buttons.unshift(this.applyFilter ? ACTIONS.toggleChangedOff : ACTIONS.toggleChangedOn)
    }
    this.qp.buttons = buttons
  }

  /** Manually trigger a title button action */
  async triggerAction(actionOrOffset: number | ActionId | Action): Promise<void> {
    const action = getButtonAction(actionOrOffset, this.qp.buttons, ACTIONS)

    switch (action) {
      case ACTIONS.toggleChangedOn:
      case ACTIONS.toggleChangedOff: {
        this.updateButtons()
        this.updateItems()
        return
      }
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
  async triggerItemAction(
    actionOrOffset: number | ActionId | Action,
    item = this.qp.activeItems[0],
  ): Promise<void> {
    const action = getButtonAction(actionOrOffset, item.buttons, ACTIONS)

    switch (action) {
      case ACTIONS.openSplit: {
        this.openItem(item, vscode.ViewColumn.Beside)
        return void this.qp.hide()
      }
      case ACTIONS.openDiff: {
        return void this.openItemDiff(item, this.ref, toRef('HEAD'))
      }
      case ACTIONS.openChanges: {
        const repo = getRepository(await getGitAPI())
        const commit = await repo.getCommit(this.ref.commit)
        const parent = commit.parents[0]
        if (!parent) {
          vscode.window.showInformationMessage(`${formatRef(this.ref)} has no parent commit.`)
          return
        }
        return void this.openItemDiff(item, toRef({ commit: parent }), this.ref)
      }
    }

    vscode.window.showErrorMessage('Quick Opener: Unknown item action')
  }

  private async openItem(
    item: FilePickItem | undefined,
    viewColumn = vscode.ViewColumn.Active,
  ): Promise<void> {
    return openFileRevision(item?.path, this.ref, viewColumn).catch(err => {
      vscode.window.showErrorMessage(err.message)
    })
  }

  private async openItemDiff(
    item: FilePickItem | undefined,
    base: Ref & { commit: string },
    target: Ref & { commit: string },
  ): Promise<void> {
    if (!item?.path) return
    const api = await getGitAPI()
    const repo = getRepository(api)
    const fileUri = vscode.Uri.joinPath(repo.rootUri, item.path)
    const baseUri = api.toGitUri(fileUri, base.commit)
    const targetUri = api.toGitUri(fileUri, target.commit)
    const title = `${item.path} (${formatRef(base)} ↔ ${formatRef(target)})`
    await vscode.commands.executeCommand('vscode.diff', baseUri, targetUri, title)
  }
}
