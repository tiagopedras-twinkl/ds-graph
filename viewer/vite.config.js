import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import fs from 'node:fs'
import path from 'node:path'

// This repo is the tool and holds no library data, so there is no default
// snapshot and no path baked in. A build contains library data only when
// DS_SNAPSHOT explicitly names a file. Otherwise the viewer opens on the picker,
// and restores whatever the last session opened — see src/lib/session.js.
//
// There used to be a fallback here pointing at a fixed file beside this repo.
// It made a build silently carry real data depending on which machine ran it,
// which is the opposite of what a tool-only repo should do.
const snapshotPath = process.env.DS_SNAPSHOT
  ? path.resolve(process.cwd(), process.env.DS_SNAPSHOT)
  : null

const hasSnapshot = Boolean(snapshotPath) && fs.existsSync(snapshotPath)

if (snapshotPath && !hasSnapshot) {
  throw new Error(`DS_SNAPSHOT points at a file that does not exist: ${snapshotPath}`)
}

// A virtual module rather than an import of a real file inside src/, because the
// file now lives outside this repo and a static import of something that may not
// exist fails the build. This resolves to `null` when there is no snapshot.
function localSnapshot() {
  const id = 'virtual:local-snapshot'
  const resolved = '\0' + id
  return {
    name: 'local-snapshot',
    resolveId: (incoming) => (incoming === id ? resolved : null),
    load(incoming) {
      if (incoming !== resolved) return null
      if (!hasSnapshot) return 'export default null'
      this.addWatchFile(snapshotPath)
      return `export default ${fs.readFileSync(snapshotPath, 'utf8')}`
    },
  }
}

// Bundled into one HTML file (no ES module <script>, everything inlined) so
// the built output opens directly from file:// — ordinary module scripts are
// blocked by CORS under file://, which defeats the point of a viewer that's
// meant to run with no server and no Figma connection.
export default defineConfig({
  plugins: [react(), viteSingleFile(), localSnapshot()],
  // Relative so the same build works opened from file:// and served from a
  // subpath like /ds-graph/ on GitHub Pages. An absolute base would 404 the
  // favicon in both cases.
  base: './',
  // Where that snapshot came from on the machine that built the app, so the
  // header can show it. Baked in at build time because the browser has no way to
  // ask the filesystem this once the app is running.
  define: {
    __SNAPSHOT_PATH__: JSON.stringify(hasSnapshot ? snapshotPath : null),
  },
  // example.snapshot.json and lib/snapshot-graph.mjs live above this root, at the
  // repo root, shared with the CLI so there's only one copy of each.
  // PORT is honoured so a harness that assigns a port (rather than taking Vite's
  // own 5173-and-upwards search) opens the right one.
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    fs: { allow: ['..'] },
  },
})
