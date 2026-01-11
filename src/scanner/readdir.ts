import { readdir, stat } from 'fs/promises'
import { ScannerBase, type ScanWorker } from './base'

export class ReaddirScanner extends ScannerBase {
  async scan(
    root: string,
    { maxTime = this.timeout, maxDepth = this.maxDepth, depth = 0 } = {},
  ): ScanWorker {
    root = this.normalizePath(root)

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

    const recursiveTimouts: any[] = []

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
            // eslint-disable-next-line no-loop-func
            workers.push(
              new Promise((resolve, reject) => {
                recursiveTimouts.push(
                  setTimeout(() => {
                    const remainingTime2 = timestamp + maxTime - Date.now()
                    if (remainingTime2 <= 0) {
                      resolve(undefined)
                    } else {
                      this.scan(childPath, {
                        maxTime: remainingTime2,
                        maxDepth,
                        depth: depth + 1,
                      }).then(resolve, reject)
                    }
                  }, depth + 1),
                )
              }),
            )
          }
          rootEntry[isDir ? 'dirs' : 'files']!.push(childPath)
        }

        return Promise.race([
          new Promise(resolve => setTimeout(resolve, Math.max(0, remainingTime))),
          Promise.allSettled(workers),
        ]).then(() => {
          // Clear any remaining timeouts
          for (const t of recursiveTimouts) {
            clearTimeout(t)
          }
          return rootEntry
        })
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

  async isDirectory(pth: string): Promise<boolean> {
    pth = this.normalizePath(pth)
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
}

// Lightweight test runner
if (require.main === module) {
  const pe = new ReaddirScanner()
  pe.scan(process.cwd()).then(res => {
    console.log(pe.toArray(res))
  })
}
