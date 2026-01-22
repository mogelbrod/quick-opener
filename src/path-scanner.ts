import { readdir, stat } from 'fs/promises'
import path from 'path'

const SEP = path.sep

/**
 * Object used to track directories that have been encountered, and possibly scanned.
 * Use the associated scanner `forEach()` or `toArray()` methods to iterate through entries recursively.
 */
export interface ScanEntry {
  /** Absolute path to directory, always ends with a `path.sep` */
  path: string
  /** Time entry was created in UNIX milliseconds */
  timestamp: number
  /** Directories found in `path` (not recursive) */
  dirs?: string[]
  /** Files found in `path` (not recursive) */
  files?: string[]
  /** Encountered error while scanning? */
  errored?: boolean
  /**
   * Worker promise used to scan, resolves once done.
   * Undefined means that the directory hasn't been scanned yet.
   */
  worker?: ScanWorker
}

export type ScanWorker = Promise<ScanEntry>

export const DEFAULT_EXCLUDES: readonly string[] = ['node_modules', '.git', '.DS_Store']

export class PathScanner {
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

  /**
   * Creates a new PathScanner instance with optional configuration.
   *
   * @param exclude - File/directory names to exclude from results
   * @param maxCandidates - Maximum number of items to include in enumeration (0 = unlimited)
   * @param maxDepth - Maximum directory recursion depth
   * @param timeout - Maximum scan time in milliseconds
   * @param dirTTL - Directory cache TTL in milliseconds
   */
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

  /**
   * Recursively scans a directory and returns a ScanEntry with discovered files and subdirectories.
   *
   * @param root - Starting directory path
   * @param maxTime - Maximum time to spend scanning in milliseconds
   * @param maxDepth - Maximum directory recursion depth
   * @param depth - Current recursion depth
   * @returns Promise resolving to a {@link ScanEntry} containing scan results
   */
  async scan(
    root: string,
    { maxTime = this.timeout, maxDepth = this.maxDepth, depth = 0 } = {},
  ): ScanWorker {
    root = this.ensureTrailingSep(root)

    const timestamp = Date.now()
    // console.log('scan', root, maxTime)

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
      .then(entries => {
        const timestampAfter = Date.now()
        const remainingTime = timestamp + maxTime - timestampAfter
        // console.log('done', root, remainingTime, entries.length)

        const workers: Promise<any>[] = []

        for (const entry of entries) {
          if (this.exclude.has(entry.name)) {
            continue
          }
          const childPath = root + entry.name
          const isDir = entry.isDirectory()
          if (isDir && remainingTime > 0 && maxDepth > depth && !this.getEntry(childPath)) {
            const timeLeft = timestamp + maxTime - Date.now()
            if (timeLeft > 0) {
              workers.push(
                this.scan(childPath, {
                  maxTime: timeLeft,
                  maxDepth,
                  depth: depth + 1,
                }),
              )
            }
          }
          rootEntry[isDir ? 'dirs' : 'files']!.push(childPath)
        }

        if (workers.length === 0) {
          return rootEntry
        }

        return Promise.allSettled(workers).then(() => rootEntry)
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

  /**
   * Iterates through all files and directories in the scan results, invoking a callback for each.
   *
   * @param root - Root path or {@link ScanEntry} to start from
   * @param callback - Function called for each item with path and directory flag
   */
  forEach(root: string | ScanEntry, callback: (pth: string, isDir: boolean) => void): void {
    const queue = [root && typeof root === 'object' ? root.path : root]
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
  }

  /**
   * Converts scan results to an array of paths.
   *
   * @param root - Root path or {@link ScanEntry} to convert
   * @returns Array of file and directory paths
   */
  toArray(root: string | ScanEntry): string[] {
    const result: string[] = []
    this.forEach(root, (pth, isDir) => {
      result.push(isDir ? pth + SEP : pth)
    })
    return result
  }

  /**
   * Retrieve a scan entry from the cache, optionally creating it if missing.
   *
   * @param pth - Path to retrieve entry for
   * @param createIfMissing - Whether to create entry if not found
   * @returns `ScanEntry` from cache or undefined if not found
   */
  getEntry(pth: string, createIfMissing: true): ScanEntry
  getEntry(pth: string, createIfMissing?: false): ScanEntry | undefined
  getEntry(pth: string, createIfMissing = false): ScanEntry | undefined {
    pth = this.ensureTrailingSep(pth)
    let entry = this.dirs.get(pth)
    if (entry && entry.timestamp + this.dirTTL < Date.now()) {
      entry.worker = undefined
    }
    if (!entry && createIfMissing) {
      entry = { path: pth, timestamp: Date.now() }
      this.dirs.set(pth, entry)
    }
    return entry
  }

  /**
   * Remove a scan entry from the cache.
   *
   * @param pth - Path to remove from cache
   * @returns True if entry was deleted, false otherwise
   */
  flushEntry(pth: string): boolean {
    return this.dirs.delete(this.ensureTrailingSep(pth))
  }

  /**
   * Determines if a path points to a directory using the scanner cache or filesystem.
   *
   * @param pth - Path to check
   * @returns Promise resolving to true if path is a directory, false otherwise
   */
  async isDirectory(pth: string): Promise<boolean> {
    pth = this.ensureTrailingSep(pth)
    const entry = this.getEntry(pth)
    let isDir = !!entry
    // Check if the path points to a directory
    // If so store it as an unscanned entry to enable later lookups
    if (!isDir) {
      isDir = await stat(pth)
        .then(x => x.isDirectory())
        .catch(() => false)
      if (isDir) {
        // Create entry if it hasn't been created during the async stat call
        this.getEntry(pth, true)
      }
    }
    return isDir
  }

  /**
   * Ensures a path ends with the platform-specific path separator.
   *
   * @param pth - Path to normalize
   * @returns Path with trailing separator
   */
  ensureTrailingSep(pth: string): string {
    return pth.endsWith(SEP) ? pth : pth + SEP
  }
}

// Lightweight test runner
if (require.main === module) {
  const pe = new PathScanner()
  pe.scan(process.cwd()).then(res => {
    console.log(pe.toArray(res))
  })
}
