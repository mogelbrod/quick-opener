import { rgPath } from '@vscode/ripgrep'
import { spawn } from 'child_process'
import * as path from 'path'
import { type ScanEntry, ScannerBase, type ScanWorker } from './base'

/** Determine if ripgrep is available */
export function isRipgrepAvailable(): boolean {
  return !!(rgPath && rgPath.length > 0)
}

export class RipgrepScanner extends ScannerBase {
  async scan(
    root: string,
    { maxTime = this.timeout, _maxDepth = this.maxDepth, _depth = 0 } = {},
  ): ScanWorker {
    root = this.ensureTrailingSep(root)

    const timestamp = Date.now()

    const rootEntry = this.getEntry(root, true)
    if (rootEntry.worker) {
      return rootEntry.worker
    }

    // Reset entry in preparation for scan
    Object.assign(rootEntry, {
      timestamp,
      dirs: [],
      files: [],
    })

    this.dirs.set(root, rootEntry)

    return (rootEntry.worker = new Promise((resolve, reject) => {
      this.runRipgrep(root, maxTime, rootEntry, (error?: Error) => {
        if (error) {
          rootEntry.errored = true
          reject(error)
        } else {
          resolve(rootEntry)
        }
      })
    }))
  }

  private runRipgrep(
    root: string,
    maxTime: number,
    rootEntry: ScanEntry,
    callback: (error?: Error) => void,
  ): void {
    // Build ripgrep arguments to list files
    const excludeGlobs = Array.from(this.exclude).flatMap(exclude => ['--glob', `!${exclude}`])
    const args = ['--files', '-uu', '--color=never', '--line-buffered', '--trim', ...excludeGlobs]

    console.log('Running:', rgPath, ...args)

    const spawnProcess = spawn(rgPath, args, {
      timeout: maxTime,
      cwd: root,
    })
    spawnProcess.stdout.setEncoding('utf8')
    spawnProcess.stderr.setEncoding('utf8')

    const files: string[] = []
    const dirSet = new Set<string>()

    spawnProcess.stdout.on('data', (data: string) => {
      const lines = data.split('\n').filter(Boolean)

      for (const filePath of lines) {
        if (!filePath) {
          continue
        }

        // Determine if this is a directory by checking if it ends with path.sep
        // ripgrep reports files, so we need to infer directories from the file paths
        const parts = filePath.split(path.sep)

        // Add all intermediate directories
        let currentPath = root
        for (let i = 0; i < parts.length - 1; i++) {
          currentPath = currentPath + parts[i] + path.sep
          if (!dirSet.has(currentPath) && this.shouldInclude(parts[i])) {
            dirSet.add(currentPath)
            rootEntry.dirs!.push(currentPath)
          }
        }

        // Add the file itself
        if (this.shouldInclude(parts[parts.length - 1])) {
          files.push(filePath)
        }
      }
    })

    spawnProcess.stderr.on('data', (data: string) => {
      console.error('stderr data:', data)
    })

    spawnProcess.on('exit', (code: number | null) => {
      console.log('exit code:', code, 'files found:', files.length)
      if (code === 0 || code === 1 || code === null) {
        // Code 1 means no results found, which is fine
        rootEntry.files = files
        callback()
      } else if (code === 124) {
        // Timeout - return what we have so far
        rootEntry.files = files
        callback()
      } else {
        // Other error codes
        const error = new Error(`Ripgrep exited with code ${code}`)
        callback(error)
      }
    })

    spawnProcess.on('error', err => {
      console.error('spawn error:', err)
      callback(err)
    })
  }

  private shouldInclude(name: string): boolean {
    return !this.exclude.has(name)
  }

  async isDirectory(pth: string): Promise<boolean> {
    pth = this.ensureTrailingSep(pth)
    const entry = this.getEntry(pth)
    return !!entry
  }
}
