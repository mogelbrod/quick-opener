import { readdir, stat } from 'fs/promises'
import path = require('path')

type ScanWorker = Promise<ScanEntry>

/** Object used to track directories that have been encountered, and possibly scanned */
export type ScanEntry = {
  /** Absolute path to directory, always ends with a `path.sep` */
  path: string
  /** Time entry was created in UNIX milliseconds */
  timestamp: number
  /** Directories found in `path` */
  dirs?: string[]
  /** Files found in `path` */
  files?: string[]
  /** Encountered error while scanning? */
  errored?: boolean
  /**
   * Worker promise used to scan, resolves once done.
   * Undefined means that the directory hasn't been scanned yet.
   */
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

    const rootEntry = this.getEntry(root) || { path: root, timestamp }
    if (rootEntry.worker) {
      return rootEntry.worker
    }

    // Reset directory contents in preparation for scan
    Object.assign(rootEntry, {
      dirs: [],
      files: [],
    })

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
          rootEntry[isDir ? 'dirs' : 'files']!.push(childPath)
        }

        return Promise.race([
          new Promise((resolve) =>
            setTimeout(resolve, Math.max(0, remainingTime)),
          ),
          Promise.allSettled(workers),
        ]).then(() => rootEntry)
      })
      .catch((error: Error & { code?: string }) => {
        rootEntry.errored = true
        // Re-throw errors that don't appear to be file system errors
        if (!error.code) {
          throw error
        }
        return rootEntry
      }))
  }

  public forEach(
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
      if (entry.dirs?.length) {
        queue.push(...entry.dirs)
        entry.dirs.forEach(dirCallback)
      }
      entry.files?.forEach(fileCallback)
    }

    return result
  }

  public toArray(root: string | ScanEntry): string[] {
    const result: string[] = []
    this.forEach(root, (pth, isDir) => {
      result.push(isDir ? pth + path.sep : pth)
    })
    return result
  }

  public getEntry(pth: string): ScanEntry | undefined {
    pth = this.normalizePath(pth)
    const entry = this.dirs.get(pth)
    if (entry && entry.timestamp + this.dirTTL > Date.now()) {
      entry.worker = undefined
    }
    return entry
  }

  /** Utilize the scanner to determine if a path points to a directory */
  async isDirectory(pth: string): Promise<boolean> {
    pth = this.normalizePath(pth)
    const entry = this.getEntry(pth)
    // Only valid directories are stored as entries
    if (entry && !entry.errored) {
      return true
    }
    // Check if the path points to a directory
    // If so store it as an unscanned entry to enable later lookups
    const isDir = await stat(pth)
      .then((x) => x.isDirectory())
      .catch(() => false)
    if (isDir) {
      this.dirs.set(pth, { path: pth, timestamp: Date.now() })
    }
    return isDir
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
