import * as vscode from 'vscode'
import type { Ref } from './git'

/** Common interface implemented by all quick picker opener classes. */
export interface Opener {
  show(): void
  dispose(): void
  triggerAction(actionOrOffset: number | string | InputButton): void
  triggerItemAction(actionOrOffset: number | string | InputButton): void
}

export interface InputButton extends vscode.QuickInputButton {
  /** ID used to target button via `triggerAction` and `triggerItemAction` commands */
  id: string
}

/** Value set on the `inQuickOpener` context key. `false` means no opener is visible. */
export type OpenerContext = 'quick' | 'revision' | 'revision-file' | false

/** Set the `inQuickOpener` context value. Pass `false` to clear it. */
export function setOpenerContext(value: OpenerContext): void {
  vscode.commands.executeCommand('setContext', 'inQuickOpener', value ?? false)
}

/** Resolve a button action from an offset index, string ID, or button object. */
export function getButtonAction<
  Action extends InputButton = InputButton,
  Actions extends Record<string, Action> = Record<string, Action>,
>(
  actionOrOffset: number | string | vscode.QuickInputButton,
  buttons: readonly vscode.QuickInputButton[] | undefined,
  actionIdToButtonMap: Actions,
): Action & { id: string } {
  const action =
    typeof actionOrOffset === 'number'
      ? buttons?.[actionOrOffset - 1]
      : typeof actionOrOffset === 'string'
        ? actionIdToButtonMap[actionOrOffset] ||
          Object.values(actionIdToButtonMap).find(btn => btn.id === actionOrOffset)
        : actionOrOffset
  if (!action) {
    const actionStr = JSON.stringify(actionOrOffset)
    throw new Error(`Unknown action (got ${actionStr})`)
  }
  return action as Action & { id: string }
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
