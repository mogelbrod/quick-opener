import * as path from 'path'

export function isDot(pth: string) {
  return pth === '.' || pth === '..'
}

export function hasDirSuffix(pth: string) {
  return pth.endsWith(path.sep)
}

export function appendDirSuffix(pth: string) {
  return hasDirSuffix(pth) ? pth : pth + path.sep
}

export function trimDirSuffix(pth: string) {
  return hasDirSuffix(pth) ? pth.slice(0, -1) : pth
}