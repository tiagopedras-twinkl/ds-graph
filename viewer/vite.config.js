import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Bundled into one HTML file (no ES module <script>, everything inlined) so
// the built output opens directly from file:// — ordinary module scripts are
// blocked by CORS under file://, which defeats the point of a viewer that's
// meant to run with no server and no Figma connection.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  // Relative so the same build works opened from file:// and served from a
  // subpath like /ds-graph/ on GitHub Pages. An absolute base would 404 the
  // favicon in both cases.
  base: './',
  // The example snapshot and lib/snapshot-graph.mjs live above this root,
  // shared with the CLI so there's only one copy of each.
  // PORT is honoured so a harness that assigns a port (rather than taking Vite's
  // own 5173-and-upwards search) opens the right one.
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    fs: { allow: ['..'] },
  },
})
