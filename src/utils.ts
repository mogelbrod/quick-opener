import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import * as vscode from 'vscode'
import type { API, GitExtension, Ref, Repository } from './git'

/** Reference to extension globalState object, set by {@link setGlobalState}. */
let _globalState: vscode.Memento | undefined

/** Store the extension context's globalState for later retrieval. */
export function setGlobalState(ctx: vscode.ExtensionContext): void {
  _globalState = ctx.globalState
}

/** Retrieve the stored extension globalState. */
export function getGlobalState(): vscode.Memento | undefined {
  return _globalState
}

/** Mirror of the RefType const enum from the git extension API */
export const RefType = { Head: 0, RemoteHead: 1, Tag: 2 } as const

/** Retrieve the VS Code git extension API */
export async function getGitAPI(): Promise<API> {
  const ext = vscode.extensions.getExtension<GitExtension>('vscode.git')
  if (!ext) {
    throw new Error('Quick Opener: Git extension (vscode.git) is not available')
  }
  if (!ext.isActive) {
    await ext.activate()
  }
  const api = ext.exports.getAPI(1)
  if (api.state !== 'initialized') {
    await new Promise<void>((resolve, reject) => {
      const d = api.onDidChangeState(state => {
        if (state === 'initialized') {
          d.dispose()
          resolve()
        } else {
          reject(new Error('Quick Opener: Git extension (vscode.git) is not available'))
        }
      })
    })
  }
  return api
}

/** Get the repository for the active editor file, falling back to the first open repo. */
export function getRepository(api: API): Repository {
  const activeUri = vscode.window.activeTextEditor?.document.uri
  const repo = activeUri ? api.getRepository(activeUri) : null
  const result = repo ?? api.repositories[0] ?? null
  if (!result) {
    throw new Error('Quick Opener: No git repository found in the current workspace')
  }
  return result
}

const execFile = promisify(execFileCb)

/** List all files at a given git ref using `git ls-tree`. */
export async function listFilesAtRef(
  gitPath: string,
  repoRoot: string,
  ref: string,
): Promise<string[]> {
  const { stdout } = await execFile(gitPath, ['ls-tree', '-r', '--name-only', '-z', ref], {
    cwd: repoRoot,
  }).catch((error: Error & { stdout?: string; stderr?: string }) => {
    const msg = error.stderr?.trim()
    throw msg ? new Error(msg) : error
  })
  return stdout.split('\0').filter(Boolean)
}

/** Opens a vscode multi-diff buffer for changes between two refs */
export async function openDiffBetween(base: Ref, target: Ref): Promise<void> {
  if (!base.commit || !target.commit) {
    vscode.window.showErrorMessage('Quick Opener: Incomplete arguments (missing commit SHA).')
    return
  }
  const api = await getGitAPI()
  const repo = getRepository(api)

  const baseTitle = formatRef(base)
  const targetTitle = formatRef(target)
  const changes = await repo.diffBetween(base.commit, target.commit)
  if (!changes.length) {
    vscode.window.showInformationMessage(`No changes between ${baseTitle} and ${targetTitle}.`)
    return
  }
  const resources = changes.map(c => [
    c.uri,
    api.toGitUri(c.originalUri, base.commit!),
    api.toGitUri(c.uri, target.commit!),
  ])
  vscode.commands.executeCommand('vscode.changes', `${baseTitle} ↔ ${targetTitle}`, resources)
}

/** Normalize a string SHA or partial {@link Ref} into a fully-qualified Ref object. */
export function toRef(ref: string | Partial<Ref>): Ref & { name: string; commit: string } {
  return typeof ref === 'string'
    ? { commit: ref, name: ref, type: RefType.Head }
    : ref.commit && ref.name
      ? (ref as any)
      : { type: RefType.Head, ...ref, commit: ref.commit ?? '', name: ref.name ?? '' }
}

/** Format a ref for display, combining name and abbreviated commit SHA. */
export function formatRef(ref: string | Ref, withName = true): string {
  const commit = typeof ref === 'string' ? ref : (ref.commit ?? '')
  if (!withName || commit === 'HEAD') return commit
  return typeof ref === 'string' || !ref.name
    ? commit.slice(0, 8)
    : ref.name + (ref.name === commit ? '' : ` [${commit.slice(0, 8)}]`)
}

/**
 * Interpolate `{key}` and `{key:format}` placeholders from `quickOpener.refDescriptionFormat`.
 * Unresolved keys are replaced with an empty string.
 */
export function formatRefDescription(ref: Ref, format: string): string {
  const d = ref.commitDetails
  return format.replace(/\{(\w+)(?::([^}]+))?\}/g, (_, key: string, fmt: string | undefined) => {
    let val = d?.[key as keyof typeof d]
    if (key === 'commit' && fmt) {
      val = (val as string)?.slice(0, +fmt)
    } else if (key === 'message') {
      val = (val as string)?.replace(/\n.*/s, '…')
    }
    if (val == null) return ''
    if (val instanceof Date) {
      return fmt ? formatDate(val, fmt) : val.toLocaleDateString()
    }
    return String(val) || ''
  })
}

/** Abbreviated English month names. */
export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** Zero-pads a number or string to at least 2 digits. */
export const pad2 = (n: number | string) => String(n).padStart(2, '0')

/**
 * Format a date using simple token substitution.
 * Supported tokens: YYYY, YY, MMM, MM, DD, D, HH, H, mm, ss.
 * VS Code exposes no date formatting utilities. For richer format strings consider:
 * - date-fns `format()` — tree-shakeable, ~4 KB for the format function alone
 * - dayjs with the format plugin — ~2 KB gzipped, moment-compatible tokens
 */
export function formatDate(date: Date, fmt: string): string {
  return fmt.replace(/YYYY|YY|MMM|MM|DD|HH|mm|ss|D|H/g, token => {
    switch (token) {
      case 'YYYY':
        return String(date.getFullYear())
      case 'YY':
        return String(date.getFullYear()).slice(-2)
      case 'MMM':
        return MONTHS[date.getMonth()]
      case 'MM':
        return pad2(date.getMonth() + 1)
      case 'DD':
        return pad2(date.getDate())
      case 'D':
        return String(date.getDate())
      case 'HH':
        return pad2(date.getHours())
      case 'H':
        return String(date.getHours())
      case 'mm':
        return pad2(date.getMinutes())
      case 'ss':
        return pad2(date.getSeconds())
      default:
        return token
    }
  })
}
