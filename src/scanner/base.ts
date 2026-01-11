import * as path from 'path'

export type ScanWorker = Promise<ScanEntry>

/** Object used to track directories that have been encountered, and possibly scanned */
export interface ScanEntry {
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

export abstract class ScannerBase {
  /** List of directory/file names to exclude from result lists. */
  exclude: Set<string>

  /** Directory scan cache for this instance */
  readonly dirs = new Map<string, ScanEntry>()

  /** Maximum number of items to include in entry enumeration */
  maxCandidates: number

  /** Maximum number of directories to recurse into */
  maxDepth: number

  /** Maximum time (in ms) for scanner to run between input and showing results */
  timeout: number

  /**
   * Maximum time for a scan entry to be considered fresh, after which any
   * subsequent accesses will trigger a new scan.
   */
  dirTTL: number

  constructor({
    exclude = DEFAULT_EXCLUDES as string[],
    maxCandidates = 0,
    maxDepth = 20,
    timeout = 100,
    dirTTL = 30e3,
  } = {}) {
    this.exclude = new Set(exclude)
    this.maxCandidates = maxCandidates
    this.maxDepth = maxDepth
    this.timeout = timeout
    this.dirTTL = dirTTL
  }

  /** Implementation specific recursive scanner */
  abstract scan(
    root: string,
    options?: { maxTime?: number; maxDepth?: number; depth?: number },
  ): ScanWorker

  forEach(root: string | ScanEntry, callback: (pth: string, isDir: boolean) => void) {
    const queue = [root && typeof root === 'object' ? root.path : root]
    const result: string[] = []
    const seen = new Set<string>()
    let length = 0

    while (queue.length && (!this.maxCandidates || length < this.maxCandidates)) {
      const entry = this.getEntry(queue.pop() as string)
      if (!entry) {
        continue
      }

      // Process directories
      const dirs = entry.dirs
      if (dirs?.length) {
        length += dirs.length
        queue.push(...dirs)
        for (let i = 0; i < dirs.length; i++) {
          const pth = dirs[i]
          if (seen.has(pth)) {
            continue
          }
          seen.add(pth)
          callback(pth, true)
        }
      }

      // Process files
      const files = entry.files
      if (files?.length) {
        length += files.length
        for (let i = 0; i < files.length; i++) {
          const pth = files[i]
          if (seen.has(pth)) {
            continue
          }
          seen.add(pth)
          callback(pth, false)
        }
      }
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

  /** Retrieve a scan entry from the cache */
  getEntry(pth: string, createIfMissing: true): ScanEntry
  getEntry(pth: string, createIfMissing?: false): ScanEntry | undefined
  getEntry(pth: string, createIfMissing = false) {
    pth = this.normalizePath(pth)
    let entry = this.dirs.get(pth)
    if (entry && entry.timestamp + this.dirTTL > Date.now()) {
      entry.worker = undefined
    }
    if (!entry && createIfMissing) {
      entry = { path: pth, timestamp: Date.now() }
      this.dirs.set(pth, entry)
    }
    return entry
  }

  /** Remove a scan entry from the cache */
  flushEntry(pth: string): boolean {
    return this.dirs.delete(this.normalizePath(pth))
  }

  /** Utilize the scanner to determine if a path points to a directory */
  abstract isDirectory(pth: string): Promise<boolean>

  normalizePath(pth: string): string {
    return pth.endsWith(path.sep) ? pth : pth + path.sep
  }
}
