# ds-graph

A dependency map of a design system, built **from Figma only**. No code is read.
It lets you inspect what depends on what — which components bind which tokens,
which tokens alias which others, which components nest which — so that one
question can be answered before anyone proposes a change:

> If I change this token, style or component, what else moves?

A library holds far more of these links than anyone can keep in their head, so
the tool is built for "what breaks", not for browsing: a force-directed picture
of everything looks impressive and answers nothing.

## The data is not in this repo

This repo is the tooling only, and holds no library data at all. It reads
**snapshots** — dated captures of the Figma library produced by the `ds-snapshot`
skill — which live outside it, in `../ds-snapshots` when the two sit side by
side. Set `DS_SNAPSHOTS_DIR` to look elsewhere.

The snapshot format is not ours to define. It belongs to the skill, which owns
it, versions it and validates it: the contract is
`ds-skills/skills/ds-snapshot/references/output-contract.md`, with JSON schemas
beside it in `schemas/`. This repo adheres to that contract and never restates
it. Run the skill's validator before relying on a snapshot; we trust it and check
only what we must.

A snapshot is the only thing this reads. There is no intermediate file to rebuild
or go stale: the viewer and the CLI both open a snapshot and interpret it the
same way, through [`lib/snapshot-graph.mjs`](lib/snapshot-graph.mjs). A snapshot
is either a folder or the single `.bundle.json` it packs into; both hold the same
files under the same names, so nothing calling in has to care which.

The one exception is [`snapshot/example.snapshot.json`](snapshot/example.snapshot.json),
committed on purpose: it is synthetic, with invented names, and it is what makes
a fresh clone do something. Real snapshot data is private — never commit or
publish one.

## Running it

The viewer is the easiest way in: a searchable map with a plain-language impact
list for whatever you select.

```bash
cd viewer && npm install && npm run dev
```

`npm run build` produces a single self-contained `dist/index.html` that opens
straight from `file://` with no server. Double-clicking **run.command** starts the
dev server and opens a browser, for anyone who would rather not touch a terminal.

**Load snapshot…** in the top right opens a snapshot from your machine and swaps
the whole map over to it — nothing built, nothing uploaded, and it works in the
single-file build too. That is how to audit a library without committing its
data. If what you open isn't a whole snapshot, the viewer says what's missing and
keeps whatever was already on screen.

The viewer remembers the last snapshot you opened. Where the browser supports it
(Chrome and Edge today) it remembers the file itself, so reopening reads it again
off disk and a recapture at the same path shows up; because browsers drop read
permission between sessions, the first visit of a day offers a **Reopen** button
rather than restoring silently. Every other browser gets a cached copy instead,
labelled with the day it was cached, because a copy cannot see a newer file.
Neither works from `file://`, where browsers refuse storage to a page, so the
picker opens as before.

There is no default snapshot and no path baked into this repo. A build carries
library data only when `DS_SNAPSHOT` names a file:

```bash
DS_SNAPSHOT=../../ds-snapshots/ds-snapshot-2026-08-08-main.bundle.json npm run build
```

That puts the whole snapshot inside `dist/index.html`, so treat a built file as
data, not just an app.

For quick checks from the terminal, `query.mjs` answers the same question with no
UI. It reads the newest snapshot in `../ds-snapshots/` on its own; add
`--snapshot <folder-or-bundle>` for a different one. Partial names work, and if
more than one thing matches you get the list.

```bash
node query.mjs "green-500"                          # what breaks if this changes
node query.mjs "Button.button-primary-background"
node query.mjs --strays                             # components reaching past tokens
node query.mjs --dupes                              # same name in two collections
node query.mjs --orphans                            # defined, nothing uses them
```

## What's in the graph

Nodes carry a `kind`: `component`, `token`, `primitive` or `textStyle`. Ids come
from the capture — token paths are dotted (`Button.button-primary-background`,
`green.green-500`), components and text styles are prefixed (`Component/button`,
`TextStyle/Roboto.base medium`).

Four kinds of link, every one of them read from Figma directly, so nothing here
is guessed:

| Type | Meaning | Extra fields |
|---|---|---|
| `BINDS` | a component uses a token | `props` — `fills`, `strokes`, `paddingLeft`… |
| `ALIASES` | a token points at another token or a primitive | `mode` — the theme it applies to |
| `NESTS` | a component contains another component | `count` |
| `USES_TEXT_STYLE` | a component uses a text style | — |

Token nodes carry `modes`, a map of theme name to value, following the Design
Tokens standard. A value is a reference string wrapped in braces, a colour
object, a size object, or a plain number or string — so **check for a string
first**, and only then for `.components` (colour) or `.value` (size):

```json
{ "light": "{green.green-500}",
  "dark":  "{green.green-400}" }
```

The map is built in memory and never written to disk, so there is no second file
to rebuild or hand around, and no way for the viewer and the CLI to disagree.
`tokens.json` becomes token and primitive nodes, the per-theme token files become
each node's `modes`, `typography.json` and `components.json` become the other two
node kinds, and the four lists in `dependencies.json` become the four link types.

Two of the snapshot's lists are gaps recorded on purpose, and they survive into
the map rather than being dropped, because each is a finding: `unresolvedBindings`
becomes a link to a token that is named but has no value, and `nestsUncaptured`
becomes a link to a component marked `external`, one something nested but that
was never walked.

Only two conventions are hard-coded — the collection named exactly `Primitives`
becomes primitive nodes rather than token nodes, and `../ds-snapshots` is where
snapshots sit when nothing says otherwise. Everything else is derived from the
data.

**Load snapshot…** takes the single `.bundle.json`. An unpacked snapshot loads if
its files are picked together, but a browser file picker cannot reach into the
`tokens/` subfolder, so those tokens lose their per-theme values — the bundle is
the way in. The viewer refuses anything that isn't valid JSON, isn't a whole
bundle, or is missing one of the four required files, and says which; a refusal
changes nothing on screen. It opens with a warning instead when the dependency
layer is absent, when per-theme values are missing, or when a link points at
something the snapshot doesn't name — those links are dropped and counted, since
drawing one would invent a node. Anything else in a snapshot is left alone, so
one written by a newer version of the skill still opens.

## Refreshing

The capture runs through the Figma bridge plugin, so it cannot run unattended —
it needs a Claude session with the plugin open on **every** library file whose
components you want, not only the one that holds the variables. Ask Claude to
refresh the snapshot; the `ds-snapshot` skill writes a dated snapshot under
`ds-snapshots/` and validates it. Then open it in the viewer, which remembers it,
or point `DS_SNAPSHOT` at it for a build.

That is the whole loop — no build step between the capture and the map, and the
tool itself needs no Figma connection and no code checkout. Old snapshots are
kept, so two captures can be diffed to see what a release changed.

## Decisions already settled

- **Figma only.** An earlier version parsed a web codebase and matched Tailwind
  classes to tokens. It worked, but it was the risky half of the build and was
  deliberately scoped out.
- **Standalone repo.** No path to any codebase, no checkout required.
- **Impact analysis, not a browsable map.** See the opening question.
- **Bindings attach to components, not variants.** A deferral, not an oversight —
  see below.

Two implementation choices that look wrong and are not, so don't undo them:

- The graph view measures label widths itself (`measureLabelWidth` in
  `GraphView.jsx`) rather than using Cytoscape's `width: 'label'`, which isn't
  reliable on first mount and left long labels stacked on top of each other.
- The centre pane draws edges **reversed** from the data model, which puts the
  depended-upon node above in ELK's layout for both walk directions.

The single-file build needs `vite-plugin-singlefile`: without it Vite emits an ES
module script, browsers refuse to fetch those over `file://`, and the build
renders blank.

## What's left to do

- **Bindings per variant.** You can see that a component binds a token, but not
  that one particular variant of it does. The variant axes are already in the
  snapshot, so no re-capture is needed, but variant-level nodes would change both
  the data shape and the centre pane's layout, and there are enough of them to
  swamp the map. `VariantExplorer.jsx` currently lets you construct a combination
  without it affecting what the map shows. Add the depth once the
  component-level view has proved insufficient.
- **A change simulator.** Override a token's value, show resolved before/after
  for every affected token in every theme, and export the result as markdown to
  paste into a Figma comment or a PR. This is the intended next feature.
- **A staleness check.** A snapshot is a point in time and carries its capture
  date, but nothing warns when the one being read is old.
- **Nesting is matched by name.** An instance resolves to its parent component
  set's name, so two components sharing a name merge into one node — an icon and
  a component with the same name, typically. The loser is recorded in the
  capture's notes rather than dropped silently, and on a clash the components
  file wins over the foundations file.
- **Variables from other libraries aren't resolved.** A component still bound to
  a variable from a retired library shows as an unresolved token — named, with no
  value. That is deliberate, since it's the gap worth seeing, but it means the
  token count isn't the whole picture.
