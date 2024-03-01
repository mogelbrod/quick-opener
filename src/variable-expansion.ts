import * as path from 'path'
import * as os from 'os'
import * as process from 'process'
import * as vscode from 'vscode'

/**
 * Returns a variable expansion function based off the active vscode context at
 * time of factory creation.
 *
 * Should implement all variables listed on https://code.visualstudio.com/docs/editor/variables-reference
 * except for `${command:commandID}` and `${input:variableName}`
 *
 * Necessary until vscode provides an API for this, see https://github.com/microsoft/vscode/issues/46471
 */
export function variableExpansionFactory() {
  const activeEditor = vscode.window.activeTextEditor
  const workspaceFolders = vscode.workspace.workspaceFolders
  const activeFileUri = activeEditor?.document.uri
  const parsedPath = activeFileUri && path.parse(activeFileUri.fsPath)
  const fileWorkspaceFolder =
    activeFileUri && vscode.workspace.getWorkspaceFolder(activeFileUri)
  const relativeFile = fileWorkspaceFolder
    ? path.relative(fileWorkspaceFolder.uri.fsPath, activeFileUri.fsPath)
    : ''

  // Expand simple variables
  const values = {
    userHome: os.homedir(),
    workspaceFolderBasename: (name: string): string =>
      values.workspaceFolder(name, true),
    workspaceFolder: (name: string, basename = false) => {
      const folder = name
        ? workspaceFolders?.find((w) => w.name === name.slice(1))
        : workspaceFolders?.[0]
      return basename
        ? folder?.uri.path.split('/').pop() || ''
        : folder?.uri.fsPath || ''
    },
    file: activeFileUri?.fsPath || '',
    fileWorkspaceFolder: fileWorkspaceFolder?.uri.fsPath || '',
    relativeFile,
    relativeFileDirname: path.dirname(relativeFile),
    fileDirname: parsedPath?.dir || '',
    fileExtname: parsedPath?.ext || '',
    fileBasename: parsedPath?.base || '',
    fileBasenameNoExtension: parsedPath?.name || '',
    cwd: os.homedir(), // TODO:
    lineNumber: String((activeEditor?.selection.active.line || 0) + 1),
    selectedText: () => {
      return (
        activeEditor?.document.getText(
          new vscode.Range(
            activeEditor.selection.start,
            activeEditor.selection.end,
          ),
        ) || ''
      )
    },
    execPath: '', // TODO:
    defaultBuildTask: '', // TODO:
    pathSeparator: path.sep,
    '/': path.sep, // eslint-disable-line @typescript-eslint/naming-convention
    config: (name: string) => vscode.workspace.getConfiguration().get(name, ''),
    env: (name: string) => process.env[name] || '',
  } as const //satisfies Record<string, string | ((param: string, ...args: any[]) => string)>

  return function variableExpansion(input: string, throwOnUnresolved = true) {
    const unresolved: string[] = []
    const interpolated = input.replace(
      /\${(\w+)(:[^\]}]+)?}/g,
      (placeholder, key, param) => {
        if (Object.hasOwnProperty.call(values, key)) {
          const value = values[key as keyof typeof values]
          return typeof value === 'function' ? value(param || '') : value
        }
        unresolved.push(key)
        return ''
      },
    )
    if (unresolved.length && throwOnUnresolved) {
      throw new TypeError(
        `Unsupported variables encountered (${unresolved.join(', ')}) in "${input}"`,
      )
    }
    return interpolated
  }
}
