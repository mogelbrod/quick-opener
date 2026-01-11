import * as path from 'path'

/**
 * Checks if the given path is '.' or '..'.
 * @param pth - The path to check.
 * @returns True if the path is a dot, otherwise false.
 */
export function isDot(pth: string): boolean {
  return pth === '.' || pth === '..'
}

/**
 * Checks if the given path has a platform specific directory suffix.
 * @param pth - The path to check.
 * @returns True if the path ends with a directory separator, otherwise false.
 */
export function hasDirSuffix(pth: string): boolean {
  return pth.endsWith(path.sep)
}

/**
 * Appends a platform specific directory suffix to the given path if it doesn't
 * already have one.
 * @param pth - The path to modify.
 * @returns The path with a directory suffix.
 */
export function appendDirSuffix(pth: string): string {
  return hasDirSuffix(pth) ? pth : pth + path.sep
}

/**
 * Trims the platform specific directory suffix from the given path if it has one.
 * @param pth - The path to modify.
 * @returns The path without a directory suffix.
 */
export function trimDirSuffix(pth: string): string {
  return hasDirSuffix(pth) ? pth.slice(0, -1) : pth
}

/**
 * Checks if the given path is a vscode workspace file.
 * @param pth - The path to check.
 * @returns True if the path has a '.code-workspace' extension, otherwise false.
 */
export function isWorkspaceFile(pth: string): boolean {
  return path.extname(pth) === '.code-workspace'
}

/** `path.sep` usable in Regular expressions */
export const sepRegex = path.sep === '\\' ? '\\\\' : path.sep
