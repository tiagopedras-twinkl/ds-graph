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
  // snapshot/graph.example.json is the fallback graph and lives above this
  // root, shared with the CLI so there's only one copy of it.
  server: { fs: { allow: ['..'] } },
})
