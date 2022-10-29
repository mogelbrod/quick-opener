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

  /** Maximum number of items to include in entry enumeration */
  public maxCandidates: number

  /** Maximum time (in ms) for scanner to run between input and showing results */
  public timeout: number

  /**
   * Maximum time for a scan entry to be considered fresh, after which any
   * subsequent accesses will trigger a new scan.
   */
  public dirTTL: number

  constructor({
    exclude = DEFAULT_EXCLUDES as string[],
    maxCandidates = 0,
    timeout = 100,
    dirTTL = 30e3,
  } = {}) {
    this.exclude = new Set(exclude)
    this.maxCandidates = maxCandidates
    this.timeout = timeout
    this.dirTTL = dirTTL
  }

  async scan(root: string, maxTime = this.timeout): ScanWorker {
    root = this.normalizePath(root)

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
    let length = 0

    const dirCallback = (pth: string) => callback(pth, true)
    const fileCallback = (pth: string) => callback(pth, false)

    while (queue.length && (!this.maxCandidates || length < this.maxCandidates)) {
      const entry = this.getEntry(queue.pop() as string)
      if (!entry) {
        continue
      }
      let arrayLength: number | undefined
      if (arrayLength = entry.dirs?.length) {
        length += arrayLength
        queue.push(...entry.dirs)
        entry.dirs.forEach(dirCallback)
      }
      if (arrayLength = entry.files?.length) {
        length += arrayLength
        entry.files.forEach(fileCallback)
      }
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

  /** Retrieve a scan entry from the cache */
  getEntry(pth: string, createIfMissing: true): ScanEntry
  getEntry(pth: string, createIfMissing?: false): ScanEntry
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
  async isDirectory(pth: string): Promise<boolean> {
    pth = this.normalizePath(pth)
    const entry = this.getEntry(pth)
    let isDir = !!entry
    // Check if the path points to a directory
    // If so store it as an unscanned entry to enable later lookups
    if (!isDir) {
      isDir = await stat(pth)
        .then((x) => x.isDirectory())
        .catch(() => false)
      if (isDir) {
        // Create entry if it hasn't been created during the async stat call
        this.getEntry(pth, true)
      }
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
