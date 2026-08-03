# ds-graph

A dependency map of a design system, built **from Figma only**. No code is read.
The point is to answer one question before you change anything:

> If I change this, what else moves?

## The data is not in this repo

This repo is the tooling only. The snapshot it was built against is a private
design system library, so `snapshot/` is gitignored. The format it expects is
documented in full in **[SCHEMA.md](SCHEMA.md)**.

You don't need a snapshot to try it. With none present the viewer falls back to
`snapshot/graph.example.json`, a small synthetic graph with the real structure and
invented names, and labels itself **example data** so nobody mistakes it for a
real library:

```bash
cd viewer && npm install && npm run dev
```

## Using it

The viewer is the easiest way in — a searchable map with a plain-language
impact list for whatever you select.

```bash
cd viewer && npm install && npm run build
open dist/index.html          # single static file, no server needed
```

`npm run dev` (from `viewer/`) runs it locally with hot reload while working
on it.

### Auditing your own library

**Load snapshot…** in the top right reads any `graph.json` from your machine and
swaps the whole map over to it — no rebuild, nothing uploaded anywhere, and it
works in the single-file build too. That's the way to audit a library without
committing its data. See [SCHEMA.md](SCHEMA.md) for what the file needs to
contain; if it isn't right, the viewer says what's wrong and keeps the graph you
already had on screen.

The viewer also bakes in `viewer/src/graph.json` at build time if that file
exists, which is what makes `open dist/index.html` show your own library with no
loading step:

```bash
cp snapshot/graph.json viewer/src/graph.json
```

Note that this puts your snapshot inside `dist/index.html`, so treat a built file
as data, not just an app.

For quick one-off checks from the terminal, `query.mjs` answers the same
question without a UI:

```bash
node query.mjs "green-500"                          # what breaks if this changes
node query.mjs "Tokens/Button/button-primary-background"
node query.mjs --strays                             # components reaching past tokens
node query.mjs --dupes                              # same name in two collections
node query.mjs --orphans                            # defined, nothing uses them
```

Partial names work. If more than one thing matches, you get the list.

## What's in the graph

A mid-sized library lands somewhere around 400 nodes and 3,000 links, which is
well past the point where anyone can hold the dependencies in their head.

Four kinds of link:

- **BINDS** — a component uses a token, and for which property (`fills`, `strokes`, `paddingLeft`…)
- **ALIASES** — a token points at another token or a primitive, recorded per theme
- **NESTS** — a component contains another component
- **USES_TEXT_STYLE** — a component uses a text style

Every link comes from Figma directly, so nothing here is guessed.

## Refreshing

The snapshot is captured through the Figma bridge plugin, so it can't run
unattended — it needs a Claude session with the plugin open on the library.

1. Open the bridge plugin on the components file
2. Ask Claude to refresh the snapshot; it rewrites `snapshot/raw/*.json`
3. `node build.mjs`
4. `cp snapshot/graph.json viewer/src/graph.json`

`snapshot/graph.json` is the build output. Everything downstream reads only that
file, so the tool works with no Figma connection and no code checkout.

## Known gaps

- **One components file is captured, not the whole library.** Icons, pictograms
  and logos usually live in a separate foundations file and aren't walked. They
  appear in the graph only where a component nests one, marked `external`, with
  no bindings of their own.
- **Nesting is matched by name.** An instance resolves to its parent component
  set's name. Two components sharing a name would merge.
- **Variant axes are recorded, bindings are not split by variant.** You'll see
  that a component has 200-odd variants and which tokens it binds, but not that
  one specific variant binds one specific token. Splitting per variant is the
  obvious next step.
