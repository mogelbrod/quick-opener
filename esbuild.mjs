#!/usr/bin/env node
import { build, analyzeMetafile, context } from 'esbuild'

// CLI flags
const watch = process.argv.includes('--watch')
const minify = process.argv.includes('--minify')
const analyze = process.argv.includes('--analyze')
const sourcemapArg = process.argv.find(a => a.startsWith('--sourcemap='))

/** @type {import('esbuild').BuildOptions} */
const options = {
  bundle: true,
  format: 'cjs',
  target: 'node18',
  platform: 'node',
  sourcemap: sourcemapArg?.split('=')[1] || 'linked',
  minify,
  external: ['vscode', '@vscode/ripgrep'],
  entryPoints: ['./src/extension.ts'],
  outfile: './dist/extension.js',
  define: {
    'process.env.NODE_ENV': JSON.stringify(minify ? 'production' : 'development'),
  },
  logLevel: 'info',
}

async function main() {
  if (watch) {
    // Use esbuild's context/watch API (compatible across versions)
    const ctx = await context({ ...options, metafile: analyze })
    await ctx.watch()
    console.log('Watching for changes...')
    // Trigger an initial rebuild to print analyze report if requested
    if (analyze) {
      const result = await ctx.rebuild()
      if (result?.metafile) {
        const report = await analyzeMetafile(result.metafile)
        console.log(report)
      }
    }
  } else {
    const result = await build({ ...options, metafile: analyze })
    if (analyze && result.metafile) {
      const report = await analyzeMetafile(result.metafile)
      console.log(report)
    }
  }
}

main().catch(error => {
  console.error('Build failed:', error)
  process.exit(1)
})
