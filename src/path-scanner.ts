import { readdir } from 'fs/promises'
import path = require('path')

type ScanWorker = Promise<ScanEntry>

export type ScanEntry = {
  /** Absolute path to scanned directory, always ends with a `path.sep` */
  path: string
  /** Time of scan in UNIX milliseconds */
  timestamp: number
  /** Directories found in `path` */
  dirs: string[]
  /** Files found in `path` */
  files: string[]
  /** Error if encountered during scanning */
  error?: Error
  /** Worker promise used to scan, resolves once done */
  worker?: ScanWorker
}

export const DEFAULT_EXCLUDES: readonly string[] = ['node_modules', '.git', '.DS_Store']

export class PathScanner {
  /** List of directory/file names to exclude from result lists. */
  public exclude: Set<string>

  /** Directory scan cache for this instance */
  public readonly dirs = new Map<string, ScanEntry>()

  /** Maximum time (in ms) for scanner to run between input and showing results */
  public timeout: number

  /**
   * Maximum time for a scan entry to be considered fresh, after which any
   * subsequent accesses will trigger a new scan.
   */
  public dirTTL: number

  constructor({
    exclude = DEFAULT_EXCLUDES as string[],
    timeout = 100,
    dirTTL = 30e3,
  } = {}) {
    this.exclude = new Set(exclude)
    this.timeout = timeout
    this.dirTTL = dirTTL
  }

  async scan(root: string, maxTime = this.timeout): ScanWorker {
    root = this.normalizePath(root)

    // console.log('scan', root)
    const timestamp = Date.now()

    const rootEntry = this.getEntry(root) || {
      path: root,
      timestamp,
      dirs: [],
      files: [],
    }
    if (rootEntry.worker) {
      return rootEntry.worker
    }

    this.dirs.set(root, rootEntry)

    return (rootEntry.worker = readdir(root, { withFileTypes: true })
      .then((entries) => {
        const timestampAfter = Date.now()
        const remainingTime = timestamp + maxTime - timestampAfter

        // console.log('scanned', root, remainingTime, entries.length)

        const workers: Promise<any>[] = []

        for (const entry of entries) {
          if (this.exclude.has(entry.name)) {
            continue
          }
          const childPath = root + entry.name
          const isDir = entry.isDirectory()
          if (remainingTime > 0 && isDir && !this.getEntry(childPath)) {
            workers.push(this.scan(childPath, remainingTime))
          }
          rootEntry[isDir ? 'dirs' : 'files'].push(childPath)
        }

        return Promise.race([
          new Promise((resolve) =>
            setTimeout(resolve, Math.max(0, remainingTime)),
          ),
          Promise.allSettled(workers),
        ]).then(() => rootEntry)
      })
      .catch((error) => {
        rootEntry.error = error
        return rootEntry
      }))
  }

  forEach(
    root: string | ScanEntry,
    callback: (pth: string, isDir: boolean) => void,
  ) {
    const queue = [root && typeof root === 'object' ? root.path : root]
    const result: string[] = []

    const dirCallback = (pth: string) => callback(pth, true)
    const fileCallback = (pth: string) => callback(pth, false)

    while (queue.length) {
      const entry = this.getEntry(queue.pop() as string)
      if (!entry) {
        continue
      }
      if (entry.dirs.length) {
        queue.push(...entry.dirs)
        entry.dirs.forEach(dirCallback)
      }
      entry.files.forEach(fileCallback)
    }

    return result
  }

  toArray(root: string | ScanEntry): string[] {
    const result: string[] = []
    this.forEach(root, (pth, isDir) => {
      result.push(isDir ? pth + path.sep : pth)
    })
    return result
  }

  getEntry(pth: string): ScanEntry | undefined {
    pth = this.normalizePath(pth)
    const entry = this.dirs.get(pth)
    if (entry && entry.timestamp + this.dirTTL > Date.now()) {
      return entry
    }
    this.dirs.delete(pth)
    return undefined
  }

  normalizePath(pth: string): string {
    return pth.endsWith(path.sep) ? pth : pth + path.sep
  }
}

// Lightweight test runner
if (require.main === module) {
  const pe = new PathScanner()
  pe.scan(process.cwd()).then(res => {
    console.log(pe.toArray(res))
  })
}
