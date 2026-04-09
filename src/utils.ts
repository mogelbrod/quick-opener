import { execFile as execFileCb } from 'node:child_process'
import * as path from 'node:path'
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

/** Virtual reference to working tree */
export const WORKING_TREE_REF = {
  commit: 'working tree',
  name: 'working tree',
  type: RefType.Head,
} as const satisfies Ref

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

/** Run a git command in the repository root and return stdout as a string. */
export async function execGit(api: API, args: string[]): Promise<string> {
  const repo = getRepository(api)
  const { stdout } = await execFile(api.git.path, args, {
    cwd: repo.rootUri.fsPath,
  }).catch((error: Error & { stdout?: string; stderr?: string }) => {
    const msg = error.stderr?.trim()
    throw msg ? new Error(msg) : error
  })
  return stdout
}

/** Open specified file at a given git revision */
export async function openFileRevision(
  path: string | undefined,
  ref: Ref,
  viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active,
): Promise<void> {
  if (!path) return
  const api = await getGitAPI()
  const repo = getRepository(api)
  const fileUri = vscode.Uri.joinPath(repo.rootUri, path)
  const uri = ref === WORKING_TREE_REF ? fileUri : api.toGitUri(fileUri, ref.name || ref.commit!)
  const doc = await vscode.workspace.openTextDocument(uri)
  await vscode.window.showTextDocument(doc, { viewColumn })
}

/** List all files at a given git ref using `git ls-tree`. */
export async function listFilesAtRef(api: API, ref: string): Promise<string[]> {
  const stdout = await execGit(api, ['ls-tree', '-r', '--name-only', '-z', ref])
  return stdout.split('\0').filter(Boolean)
}

/** All git diff-tree status letters used as the default filter value. */
export const ALL_GIT_STATUSES = 'ACMDRT'

/**
 * Returns a map of file path → single uppercase status letter for all files
 * changed in a given commit.
 * Rename/copy entries are keyed by the new (destination) path.
 */
export async function listChangedFilesAtRef(
  api: API,
  ref: string,
  filterByStatus = ALL_GIT_STATUSES,
): Promise<Map<string, string>> {
  const stdout = await execGit(api, [
    'diff-tree',
    '--no-commit-id',
    '--name-status',
    '-r',
    '-z',
    ref,
  ])
  return parseGitDiffOutput(stdout, filterByStatus)
}

/**
 * Returns a map of file path → single uppercase status letter for all files
 * changed in the current working tree (vs HEAD).
 * Includes both staged and unstaged changes.
 * Rename/copy entries are keyed by the new (destination) path.
 */
export async function listChangedFilesInWorkingTree(
  api: API,
  filterByStatus = ALL_GIT_STATUSES,
): Promise<Map<string, string>> {
  const stdout = await execGit(api, ['diff', '--name-status', '-z', 'HEAD'])
  return parseGitDiffOutput(stdout, filterByStatus)
}

function parseGitDiffOutput(
  stdout: string,
  filterByStatus = ALL_GIT_STATUSES,
): Map<string, string> {
  const tokens = stdout.split('\0').filter(Boolean)
  const result = new Map<string, string>()
  let i = 0
  while (i < tokens.length) {
    const status = tokens[i++]
    const letter = status[0].toUpperCase()
    if (letter === 'R' || letter === 'C') {
      i++ // skip old path
    }
    if (!filterByStatus.includes(letter)) {
      i++ // skip path
      continue
    }
    const path = tokens[i++]
    if (path) result.set(path, letter)
  }
  return result
}

/** Opens a single-file diff or a multi-diff buffer for changes between two refs. */
export async function openDiffBetween(base: Ref, target: Ref, scopePath?: string): Promise<void> {
  if (!base.commit || !target.commit) {
    vscode.window.showErrorMessage('Quick Opener: Incomplete arguments (missing commit SHA).')
    return
  }
  const api = await getGitAPI()
  const repo = getRepository(api)

  const title = `${formatRef(base)} ↔ ${formatRef(target)}`

  const scopedPath = normalizePath(scopePath)
  const isWorkingTreeTarget = target.commit === WORKING_TREE_REF.commit
  const changes = isWorkingTreeTarget
    ? (await repo.diffWith(base.commit)).filter(c => {
        if (!scopedPath) return true
        const rel = normalizePath(path.relative(repo.rootUri.fsPath, c.uri.fsPath))
        return rel === scopedPath || rel.startsWith(`${scopedPath}/`)
      })
    : scopePath
      ? await repo.diffBetweenWithStats(base.commit, target.commit, scopePath)
      : await repo.diffBetween(base.commit, target.commit)

  // No changes found by git, but there may be dirty opened documents that match the scope.
  if (!changes.length && isWorkingTreeTarget && scopedPath) {
    const absoluteScope = path.isAbsolute(scopedPath)
      ? path.normalize(scopedPath)
      : path.join(repo.rootUri.fsPath, scopedPath)
    const dirtyDocs = vscode.workspace.textDocuments.filter(doc => {
      if (!doc.isDirty || doc.uri.scheme !== 'file') return false
      const filePath = path.normalize(doc.uri.fsPath)
      return filePath === absoluteScope || filePath.startsWith(absoluteScope + path.sep)
    })
    if (dirtyDocs.length) {
      changes.push(
        ...dirtyDocs.map(dirtyDoc => {
          const relativePath = normalizePath(
            path.relative(repo.rootUri.fsPath, dirtyDoc.uri.fsPath),
          )
          return {
            uri: dirtyDoc.uri,
            originalUri: vscode.Uri.joinPath(repo.rootUri, relativePath),
            renameUri: undefined,
            status: 0,
          }
        }),
      )
    }
  }

  if (!changes.length) {
    vscode.window.showInformationMessage(`No changes between ${title}.`)
    return
  }

  if (changes.length === 1) {
    const [change] = changes
    const baseUri = api.toGitUri(change.originalUri, base.commit)
    const targetUri = isWorkingTreeTarget ? change.uri : api.toGitUri(change.uri, target.commit)
    const fileName = change.uri.path.split('/').pop() || change.uri.path
    const fileTitle = `${fileName} (${title})`
    await vscode.commands.executeCommand('vscode.diff', baseUri, targetUri, fileTitle)
    return
  }

  const resources = changes.map(c => [
    c.uri,
    api.toGitUri(c.originalUri, base.commit!),
    isWorkingTreeTarget ? c.uri : api.toGitUri(c.uri, target.commit!),
  ])
  await vscode.commands.executeCommand('vscode.changes', title, resources)
}

function normalizePath(scope?: string): string {
  if (!scope) return ''
  return scope.replaceAll('\\', '/').replace(/\/+$/, '')
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
 */
export function formatDate(date: Date, fmt: string): string {
  return fmt.replace(/\b(YYYY|YY|MMM|MM|DD|HH|mm|ss|D|H)\b/g, token => {
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
