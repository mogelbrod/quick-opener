import * as vscode from 'vscode'
import type { Ref } from './git'
import {
  getButtonAction,
  type InputButton,
  type Opener,
  type RefQuickPickItem,
  setOpenerContext,
} from './opener'
import {
  formatRef,
  formatRefDescription,
  getGitAPI,
  getGlobalState,
  getRepository,
  openDiffBetween,
  RefType,
  toRef,
  WORKING_TREE_REF,
} from './utils'

/** Global state key for the persisted ref description style setting. */
export const REF_DESCRIPTION_STYLE_KEY = 'quickOpener.refDescriptionStyle'
/** Global state key for the cached ref commit detail objects. */
export const REF_DETAILS_KEY = 'quickOpener.refDetails'

const REF_TYPE_TO_ICON = {
  [RefType.Head]: 'git-branch',
  [RefType.RemoteHead]: 'git-branch',
  [RefType.Tag]: 'tag',
} as const

/**
 * Actions available for quick pick window/items.
 * Toggled buttons use icons that represent the current (opposite) state.
 */
export const ACTIONS = {
  toggleDescriptionCustom: {
    id: 'toggleDescription',
    iconPath: new vscode.ThemeIcon('symbol-number'),
    tooltip: 'Show custom description format',
  },
  toggleDescriptionSha: {
    id: 'toggleDescription',
    iconPath: new vscode.ThemeIcon('symbol-parameter'),
    tooltip: 'Show commit SHA in description',
  },
  toggleMessageOn: {
    id: 'toggleMessage',
    iconPath: new vscode.ThemeIcon('comment'),
    tooltip: 'Show commit message',
  },
  toggleMessageOff: {
    id: 'toggleMessage',
    iconPath: new vscode.ThemeIcon('comment-unresolved'),
    tooltip: 'Hide commit message',
  },
  openDiff: {
    id: 'openDiff',
    iconPath: new vscode.ThemeIcon('compare-changes'),
    tooltip: 'Diff against working tree',
  },
  openChanges: {
    id: 'openChanges',
    iconPath: new vscode.ThemeIcon('request-changes'),
    tooltip: 'Open changes',
  },
} as const satisfies Record<string, InputButton>

/** String union of all valid {@link ACTIONS} keys for {@link RevisionOpener}. */
export type ActionId = keyof typeof ACTIONS
/** Union type of all available action button objects for {@link RevisionOpener}. */
export type Action = (typeof ACTIONS)[ActionId]

interface LoadedRefs {
  localBranches: RefQuickPickItem[]
  remoteBranches: RefQuickPickItem[]
  tags: RefQuickPickItem[]
}

/**
 * Quick picker listing git refs (branches and/or tags).
 * Selecting a ref invokes the `onAccept` callback with the selected ref.
 */
export class RevisionOpener implements Opener {
  readonly qp: vscode.QuickPick<RefQuickPickItem | vscode.QuickPickItem>

  private loadedRefs: LoadedRefs | null = null
  private baseItems: (vscode.QuickPickItem | RefQuickPickItem)[] = []
  private showMessage: boolean
  private descriptionStyle: 'sha' | 'custom'
  private descriptionFormat: string
  private icons: boolean
  private includeBranches: boolean
  private includeTags: boolean
  private path?: string
  private onDispose?: () => void
  private onAccept?: (ref: Ref) => void

  private readonly fallbackItem: vscode.QuickPickItem = {
    label: 'Use current:',
    alwaysShow: false,
  }

  constructor(
    options: {
      initialValue?: string
      path?: string
      icons?: boolean
      branches?: boolean
      tags?: boolean
      onDispose?: () => void
      /** Called when the user accepts a ref instead of navigating into a file picker. */
      onAccept?: (ref: Ref) => void
    } = {},
  ) {
    const globalState = getGlobalState()
    this.showMessage = globalState?.get<boolean>(REF_DETAILS_KEY) ?? false
    this.descriptionStyle = globalState?.get<'sha' | 'custom'>(REF_DESCRIPTION_STYLE_KEY) ?? 'sha'
    this.descriptionFormat = vscode.workspace
      .getConfiguration('quickOpener')
      .get<string>('refDescriptionFormat', '{commitDate} - {authorName}')
    this.icons = options.icons ?? true
    this.includeBranches = options.branches !== false
    this.includeTags = options.tags !== false
    this.path = options.path
    this.onDispose = options.onDispose
    this.onAccept = options.onAccept

    this.qp = vscode.window.createQuickPick<RefQuickPickItem | vscode.QuickPickItem>()
    this.qp.title = 'Open by Revision'
    this.qp.placeholder = 'Select a branch, tag, or commit SHA…'
    this.qp.busy = true
    this.qp.matchOnDescription = true
    this.qp.matchOnDetail = false
    this.qp.value = options.initialValue || ''
    this.updateButtons()
    this.updateFallbackItem(options.initialValue ?? '')

    this.qp.onDidChangeValue(v => this.updateFallbackItem(v))
    this.qp.onDidHide(() => this.dispose())
    this.qp.onDidAccept(() => this.onAcceptItem())
    this.qp.onDidTriggerButton(b => this.triggerAction(b as Action))
    this.qp.onDidTriggerItemButton(e => this.triggerItemAction(e.button as Action, e.item))
  }

  /** Show the quick picker and begin loading git refs. */
  show(): void {
    this.qp.show()
    this.load()
    setOpenerContext('revision')
  }

  /** Hide/discard the quick picker */
  dispose(): void {
    this.onDispose?.()
    this.qp.dispose()
  }

  /** Manually trigger a title button action */
  triggerAction(actionOrOffset: number | ActionId | Action): void {
    const action = getButtonAction(actionOrOffset, this.qp.buttons, ACTIONS)

    switch (action) {
      case ACTIONS.toggleDescriptionCustom:
      case ACTIONS.toggleDescriptionSha:
        this.toggleDescriptionStyle()
        return
      case ACTIONS.toggleMessageOn:
      case ACTIONS.toggleMessageOff:
        this.toggleMessage()
        return
    }

    vscode.window.showErrorMessage('Quick Opener: Unknown action')
  }

  /** Manually trigger an item action */
  triggerItemAction(
    actionOrOffset: number | ActionId | Action,
    item = this.qp.activeItems[0],
  ): void {
    const refItem = item as RefQuickPickItem
    const action = getButtonAction(actionOrOffset, item.buttons, ACTIONS)

    this.qp.hide()

    switch (action) {
      case ACTIONS.openDiff:
        this.openDiff(refItem)
        return
      case ACTIONS.openChanges:
        this.openChanges(refItem)
        return
    }

    vscode.window.showErrorMessage('Quick Opener: Unknown item action')
  }

  private updateFallbackItem(value: string): void {
    Object.assign(this.fallbackItem, {
      description: value,
      alwaysShow: !!value,
      iconPath: this.icons ? new vscode.ThemeIcon('arrow-right') : undefined,
      buttons: [ACTIONS.openChanges, ACTIONS.openDiff],
      ref: toRef(value),
    } satisfies Partial<RefQuickPickItem>)
    this.qp.items = value ? [...this.baseItems, this.fallbackItem] : this.baseItems
  }

  private _refItemButtons = [ACTIONS.openChanges, ACTIONS.openDiff]

  private buildRefItem(ref: Ref): RefQuickPickItem {
    const icon = REF_TYPE_TO_ICON[ref.type as keyof typeof REF_TYPE_TO_ICON] || 'git-commit'
    return {
      label: this.icons ? `$(${icon}) ${ref.name}` : ref.name!,
      description:
        this.descriptionStyle === 'custom'
          ? formatRefDescription(ref, this.descriptionFormat)
          : ref.commit?.slice(0, 8),
      detail: this.showMessage ? ref.commitDetails?.message?.split('\n')[0] : undefined,
      buttons: this._refItemButtons,
      ref,
    }
  }

  private updateItems(): void {
    if (!this.loadedRefs) return
    const { localBranches, remoteBranches, tags } = this.loadedRefs
    const result: (vscode.QuickPickItem | RefQuickPickItem)[] = []
    if (localBranches.length) {
      result.push({ label: 'Local Branches', kind: vscode.QuickPickItemKind.Separator })
      result.push(...localBranches.map(item => this.buildRefItem(item.ref)))
    }
    if (remoteBranches.length) {
      result.push({ label: 'Remote Branches', kind: vscode.QuickPickItemKind.Separator })
      result.push(...remoteBranches.map(item => this.buildRefItem(item.ref)))
    }
    if (tags.length) {
      result.push({ label: 'Tags', kind: vscode.QuickPickItemKind.Separator })
      result.push(...tags.map(item => this.buildRefItem(item.ref)))
    }
    this.baseItems = result
    this.qp.items = this.fallbackItem.alwaysShow ? [...result, this.fallbackItem] : result
  }

  /** Toggle (or explicitly set) the ref description format between SHA and custom. */
  toggleDescriptionStyle(
    value: 'sha' | 'custom' = this.descriptionStyle === 'sha' ? 'custom' : 'sha',
  ): void {
    if (!this.loadedRefs) return
    this.descriptionStyle = value
    getGlobalState()?.update(REF_DESCRIPTION_STYLE_KEY, value)
    this.updateButtons()
    this.updateItems()
  }

  /** Toggle (or explicitly set) whether commit messages are shown per item. */
  toggleMessage(value = !this.showMessage): void {
    if (!this.loadedRefs) return
    this.showMessage = value
    getGlobalState()?.update(REF_DETAILS_KEY, value)
    this.updateButtons()
    this.updateItems()
  }

  private updateButtons(): void {
    this.qp.buttons = [
      ACTIONS[
        this.descriptionStyle === 'custom' ? 'toggleDescriptionSha' : 'toggleDescriptionCustom'
      ],
      ACTIONS[this.showMessage ? 'toggleMessageOff' : 'toggleMessageOn'],
    ]
  }

  private onAcceptItem(): void {
    const item = this.qp.selectedItems[0] as RefQuickPickItem
    if (!item?.ref) return
    this.dispose()
    this.onAccept?.(item.ref)
  }

  private openDiff(item: RefQuickPickItem): void {
    const ref = toRef(item.ref)
    openDiffBetween(ref, WORKING_TREE_REF, this.path)
  }

  private async openChanges(item: RefQuickPickItem): Promise<void> {
    const ref = toRef(item.ref)
    const title = formatRef(ref)
    try {
      const api = await getGitAPI()
      const repo = getRepository(api)
      const commit = await repo.getCommit(ref.commit)
      const parent = commit.parents[0]
      if (!parent) {
        vscode.window.showInformationMessage(`${title} has no parent commit.`)
        return
      }
      openDiffBetween(toRef({ commit: parent }), ref, this.path)
    } catch (err: any) {
      vscode.window.showErrorMessage(`Quick Opener: ${err.message}`)
    }
  }

  private async load(): Promise<void> {
    try {
      const api = await getGitAPI()
      const repo = getRepository(api)

      const allRefs = await repo.getRefs({
        // @ts-expect-error Not included in type but supported by the API
        includeCommitDetails: true,
      })

      const localBranches: RefQuickPickItem[] = []
      const remoteBranches: RefQuickPickItem[] = []
      const tags: RefQuickPickItem[] = []

      for (const ref of allRefs) {
        if (!ref.name) continue
        if (ref.type === RefType.Head && this.includeBranches) {
          localBranches.push(this.buildRefItem(ref))
        } else if (ref.type === RefType.RemoteHead && this.includeBranches) {
          remoteBranches.push(this.buildRefItem(ref))
        } else if (ref.type === RefType.Tag && this.includeTags) {
          tags.push(this.buildRefItem(ref))
        }
      }

      this.loadedRefs = { localBranches, remoteBranches, tags }
      this.updateItems()
    } catch (err: any) {
      this.qp.items = [
        this.fallbackItem,
        {
          label: 'Error loading refs',
          detail: err.message,
          iconPath: this.icons ? new vscode.ThemeIcon('alert') : undefined,
          isError: true,
        },
      ]
    } finally {
      this.qp.busy = false
    }
  }
}
