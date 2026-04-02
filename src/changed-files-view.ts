import * as path from 'path'
import * as vscode from 'vscode'
import { getChangedFiles, getGitAPI, getWorkspaceRepository, log } from './utils'

const STATUS_LABELS: Record<string, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  U: 'Unmerged',
  '?': 'Untracked',
  T: 'Type changed',
}

/** A single file entry in the "New or Changed since Last Commit" tree view. */
export class ChangedFileItem extends vscode.TreeItem {
  constructor(
    public readonly filePath: string,
    public readonly statusCode: string,
    repoRoot: string,
  ) {
    const absUri = vscode.Uri.file(path.join(repoRoot, filePath))
    super(absUri, vscode.TreeItemCollapsibleState.None)
    this.label = filePath
    this.description = STATUS_LABELS[statusCode] ?? statusCode
    this.iconPath = vscode.ThemeIcon.File
    this.resourceUri = absUri
    this.contextValue = statusCode === '?' ? 'untracked' : 'changed'
    this.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [absUri],
    }
  }
}

/**
 * Tree data provider for the "New or Changed since Last Commit" view in the
 * Source Control sidebar. Auto-refreshes when the git repository state changes.
 */
export class ChangedFilesViewProvider
  implements vscode.TreeDataProvider<ChangedFileItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private _repoWatcher?: vscode.Disposable
  private _watchedRepoRoot?: string

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: ChangedFileItem): vscode.TreeItem {
    return element
  }

  async getChildren(): Promise<ChangedFileItem[]> {
    try {
      const api = await getGitAPI()
      const repo = getWorkspaceRepository(api)

      if (repo.rootUri.fsPath !== this._watchedRepoRoot) {
        this._repoWatcher?.dispose()
        this._watchedRepoRoot = repo.rootUri.fsPath
        this._repoWatcher = repo.state.onDidChange(() => {
          log(
            `ChangedFilesView: repo.state changed — ` +
              `index=${repo.state.indexChanges.length}` +
              ` worktree=${repo.state.workingTreeChanges.length}` +
              ` untracked=${repo.state.untrackedChanges?.length ?? 'n/a'}`,
          )
          this.refresh()
        })
      }

      log(`ChangedFilesView.getChildren: repo=${repo.rootUri.fsPath}`)
      const files = getChangedFiles(repo)
      return files.map(f => new ChangedFileItem(f.path, f.statusCode, repo.rootUri.fsPath))
    } catch {
      return []
    }
  }

  dispose(): void {
    this._repoWatcher?.dispose()
    this._onDidChangeTreeData.dispose()
  }
}
