import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import * as nodePath from 'node:path'
import * as vscode from 'vscode'
import type { API, Change, GitExtension, Ref, Repository } from './git'

/** In-memory LRU list of recently opened file paths (most recent first, capped at 100). */
const _recentFiles: string[] = []

/** Record an opened file path, moving it to the front of the recent list. */
export function trackRecentFile(fsPath: string): void {
  const idx = _recentFiles.indexOf(fsPath)
  if (idx !== -1) _recentFiles.splice(idx, 1)
  _recentFiles.unshift(fsPath)
  if (_recentFiles.length > 100) _recentFiles.pop()
}

/** Return the current in-memory list of recently opened paths, most recent first. */
export function getRecentFiles(): readonly string[] {
  return _recentFiles
}

/** Shared output channel for the Quick Opener extension. */
let _outputChannel: vscode.OutputChannel | undefined

/** Initialize the shared output channel. Called once from activate(). */
export function setOutputChannel(channel: vscode.OutputChannel): void {
  _outputChannel = channel
}

/** Write a message to the Quick Opener output channel. */
export function log(message: string): void {
  _outputChannel?.appendLine(`[${new Date().toISOString()}] ${message}`)
}

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

/**
 * Get the most relevant repository for the current workspace context.
 *
 * Strategy (in order):
 * 1. The repo that owns the currently active editor file (most specific).
 * 2. A repo whose rootUri is an ancestor of the first workspace folder.
 * 3. The shallowest repo rooted inside the first workspace folder
 *    (prevents a deeply-nested submodule from winning over the project root).
 * 4. The shallowest repo across all registered repositories.
 */
export function getWorkspaceRepository(api: API): Repository {
  // Step 1: active editor file — most precise signal.
  // Handles both plain file:// editors and git:// diff views (where the actual
  // file path is encoded as a JSON "path" field in the URI query string).
  const activeUri = vscode.window.activeTextEditor?.document.uri
  if (activeUri) {
    let lookupUri: vscode.Uri | undefined
    if (activeUri.scheme === 'file') {
      lookupUri = activeUri
    } else if (activeUri.scheme === 'git') {
      try {
        const params = JSON.parse(decodeURIComponent(activeUri.query)) as { path?: string }
        if (params.path) lookupUri = vscode.Uri.file(params.path)
      } catch {
        // malformed query — skip
      }
    }
    if (lookupUri) {
      const active = api.getRepository(lookupUri)
      if (active) return active
    }
  }

  const workspaceFolders = vscode.workspace.workspaceFolders
  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      // Step 2: repo whose root is at or above the workspace folder
      const ancestor = api.getRepository(folder.uri)
      if (ancestor) return ancestor

      // Step 3: repos rooted inside this workspace folder — pick shallowest
      const folderFsPath = folder.uri.fsPath
      const inside = api.repositories
        .filter(r => {
          const rp = r.rootUri.fsPath
          return rp === folderFsPath || rp.startsWith(folderFsPath + nodePath.sep)
        })
        .sort((a, b) => a.rootUri.fsPath.length - b.rootUri.fsPath.length)
      if (inside.length > 0) return inside[0]
    }
  }

  // Step 4: last resort — shallowest repo overall (avoids submodules first)
  const sorted = [...api.repositories].sort(
    (a, b) => a.rootUri.fsPath.length - b.rootUri.fsPath.length,
  )
  const result = sorted[0] ?? null
  if (!result) {
    throw new Error('Quick Opener: No git repository found in the current workspace')
  }
  return result
}

const execFile = promisify(execFileCb)

/** Open specified file at a given git revision */
export async function openFileRevision(
  path: string | undefined,
  ref: Ref,
  viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active,
): Promise<void> {
  if (!path) return
  const api = await getGitAPI()
  const repo = getRepository(api)
  const uri = api.toGitUri(vscode.Uri.joinPath(repo.rootUri, path), ref.name || ref.commit!)
  const doc = await vscode.workspace.openTextDocument(uri)
  await vscode.window.showTextDocument(doc, { viewColumn })
}

/** Map of VS Code git Status numeric values to single-letter codes.
 * Values match the const enum order in git.d.ts (INDEX_MODIFIED=0, …). */
const GIT_STATUS_TO_CODE: Record<number, string | undefined> = {
  0: 'M', // INDEX_MODIFIED
  1: 'A', // INDEX_ADDED
  2: 'D', // INDEX_DELETED
  3: 'R', // INDEX_RENAMED
  4: 'C', // INDEX_COPIED
  5: 'M', // MODIFIED
  6: 'D', // DELETED
  7: '?', // UNTRACKED
  // 8 = IGNORED — excluded
  9: 'A', // INTENT_TO_ADD
  11: 'T', // TYPE_CHANGED
  12: 'U', // ADDED_BY_US
  13: 'U', // ADDED_BY_THEM
  14: 'U', // DELETED_BY_US
  15: 'U', // DELETED_BY_THEM
  16: 'U', // BOTH_ADDED
  17: 'U', // BOTH_DELETED
  18: 'U', // BOTH_MODIFIED
}

/**
 * Get all changed or new files since the last commit using the VS Code git
 * extension's already-computed repository state (same source as the built-in
 * Source Control view). Returns a deduplicated list with staged changes first,
 * then working-tree changes, then untracked files.
 */
export function getChangedFiles(
  repo: Repository,
): Array<{ path: string; statusCode: string }> {
  const repoRoot = repo.rootUri.fsPath
  const seen = new Set<string>()
  const results: Array<{ path: string; statusCode: string }> = []

  log(
    `getChangedFiles: index=${repo.state.indexChanges.length}` +
      ` worktree=${repo.state.workingTreeChanges.length}` +
      ` untracked=${repo.state.untrackedChanges?.length ?? 'n/a'}` +
      ` merge=${repo.state.mergeChanges.length}`,
  )

  const addChange = (change: Change): void => {
    const fsPath = change.uri.fsPath
    if (seen.has(fsPath)) return
    seen.add(fsPath)
    const statusCode = GIT_STATUS_TO_CODE[change.status]
    if (!statusCode) return
    // Make the path relative to the repo root
    const relative = fsPath.startsWith(repoRoot)
      ? fsPath.slice(repoRoot.length).replace(/^[\\/]/, '')
      : fsPath
    results.push({ path: relative, statusCode })
  }

  for (const change of repo.state.indexChanges) addChange(change)
  for (const change of repo.state.workingTreeChanges) addChange(change)
  for (const change of repo.state.untrackedChanges ?? []) addChange(change)
  for (const change of repo.state.mergeChanges) addChange(change)

  log(`getChangedFiles: returning ${results.length} file(s)`)
  return results
}

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
