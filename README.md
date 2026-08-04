# ds-graph

A dependency map of a design system, built **from Figma only**. No code is read.
The point is to answer one question before you change anything:

> If I change this, what else moves?

## The data is not in this repo

This repo is the tooling only. It reads **snapshots** — dated captures of a Figma
library, produced by the `ds-snapshot` skill. The one this was built against is a
private library, so `ds-snapshots/` and `snapshot/` are both gitignored. The format
is documented in full in **[SCHEMA.md](SCHEMA.md)**.

A snapshot is the only thing this reads. There is no intermediate file to rebuild
or go stale: the viewer and the CLI both open a snapshot and interpret it the same
way, through [`lib/snapshot-graph.mjs`](lib/snapshot-graph.mjs).

You don't need one to try it. With none present the viewer opens on a prompt, and
offers [`snapshot/example.snapshot.json`](snapshot/example.snapshot.json) as an
alternative — a small synthetic snapshot with the real structure and invented
names, labelled **example data** so nobody mistakes it for a real library:

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

**Load snapshot…** in the top right opens a snapshot from your machine and swaps
the whole map over to it — nothing to build, nothing uploaded anywhere, and it
works in the single-file build too. That's the way to audit a library without
committing its data. Either form works:

- the single `.bundle.json` a snapshot packs into — one file, easiest to hand around
- the snapshot folder itself — pick the folder, and its `tokens/` files come with it

If what you open isn't a whole snapshot, the viewer says what's missing and keeps
whatever was already on screen.

The viewer also bakes in `viewer/src/snapshot.json` at build time if that file
exists, which is what makes `open dist/index.html` show your own library with no
opening step:

```bash
cp ds-snapshots/ds-snapshot-2026-08-04.bundle.json viewer/src/snapshot.json
```

Note that this puts your snapshot inside `dist/index.html`, so treat a built file
as data, not just an app.

For quick one-off checks from the terminal, `query.mjs` answers the same
question without a UI:

```bash
node query.mjs "green-500"                          # what breaks if this changes
node query.mjs "Button.button-primary-background"
node query.mjs --strays                             # components reaching past tokens
node query.mjs --dupes                              # same name in two collections
node query.mjs --orphans                            # defined, nothing uses them
```

It reads the newest snapshot in `ds-snapshots/` on its own; add
`--snapshot <folder-or-bundle>` to read a different one. Partial names work, and if
more than one thing matches you get the list.

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

1. Open the bridge plugin on **every** file you want the components of — the
   foundations file as well as the components file
2. Ask Claude to refresh the snapshot; it writes a dated snapshot under
   `ds-snapshots/` and validates it
3. Open it in the viewer, or copy it to `viewer/src/snapshot.json` to bake it in

That's the whole loop — there is no build step between the capture and the map. The
tool works with no Figma connection and no code checkout. Old snapshots are kept,
so two captures can be diffed to see what a release changed.

## Known gaps

- **Nesting is matched by name.** An instance resolves to its parent component
  set's name. Two components sharing a name merge into one, and the loser is
  recorded in the capture's notes rather than silently dropped — this library has
  five such clashes, where an icon and a component share a name.
- **Variant axes are recorded, bindings are not split by variant.** You'll see
  that a component has 200-odd variants and which tokens it binds, but not that
  one specific variant binds one specific token. Splitting per variant is the
  obvious next step.
- **Variables from other libraries aren't resolved.** A component still bound to a
  variable from a retired library shows as an unresolved token, named but with no
  value. That's deliberate — it's the gap worth seeing — but it means the token
  count isn't the whole picture.
