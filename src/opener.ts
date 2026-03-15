import * as vscode from 'vscode'
import type { Ref } from './git'

/** Common interface implemented by all quick picker opener classes. */
export interface Opener {
  show(): void
  dispose(): void
  triggerAction(actionOrOffset: number | string | vscode.QuickInputButton): void
  triggerItemAction(actionOrOffset: number | string | vscode.QuickInputButton): void
}

/** Value set on the `inQuickOpener` context key. `false` means no opener is visible. */
export type OpenerContext = 'quick' | 'revision' | 'revision-file' | false

/** Set the `inQuickOpener` context value. Pass `false` to clear it. */
export function setOpenerContext(value: OpenerContext): void {
  vscode.commands.executeCommand('setContext', 'inQuickOpener', value ?? false)
}

/** Resolve a button action from an offset index, string ID, or button object. */
export function getButtonAction<
  Action extends vscode.QuickInputButton = vscode.QuickInputButton,
  Actions extends Record<string, Action> = Record<string, Action>,
>(
  actionOrOffset: number | string | Action,
  buttons: readonly Action[] | undefined,
  actionIdToButtonMap: Actions,
): Action {
  const action =
    typeof actionOrOffset === 'number'
      ? (buttons?.[actionOrOffset - 1] as Action)
      : typeof actionOrOffset === 'string'
        ? actionIdToButtonMap[actionOrOffset]
        : actionOrOffset
  if (!action) {
    const actionStr = JSON.stringify(actionOrOffset)
    throw new Error(`Unknown action (got ${actionStr})`)
  }
  return action
}

/** Quick pick item that wraps a git {@link Ref}. */
export interface RefQuickPickItem extends vscode.QuickPickItem {
  ref: Ref
  isError?: boolean
}

/** Quick pick item representing a file path entry. */
export interface FilePickItem extends vscode.QuickPickItem {
  path?: string
  isError?: boolean
}
