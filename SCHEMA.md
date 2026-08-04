# Data format

This repo ships the tooling, not the data. The snapshot it was built against is a
private design system library, so `ds-snapshots/` is not committed. This file
describes exactly what the tooling expects, so it can be pointed at another Figma
library.

**A snapshot is the only thing this repo reads.** The viewer and `query.mjs` both
open one and turn it into a map of nodes and links in memory, through the one
shared module [`lib/snapshot-graph.mjs`](lib/snapshot-graph.mjs). That map is never
written to disk, so there is no second file to rebuild, hand around, or let go
stale — and no way for the viewer and the CLI to disagree about a snapshot.

A small synthetic snapshot lives in
[`snapshot/example.snapshot.json`](snapshot/example.snapshot.json) — real
structure, invented names.

---

## The snapshot

```
ds-snapshots/<YYYY-MM-DD>/
├── manifest.json                    what this snapshot is
├── tokens.json                      every variable, default theme of each collection
├── tokens/
│   └── <collection>.<mode>.json     one file per collection × theme
├── typography.json                  text styles
├── components.json                  component inventory
└── dependencies.json                what depends on what
```

The same snapshot also travels as a single file — `ds-snapshot-<YYYY-MM-DD>.bundle.json`
— which holds each of those files verbatim under its own path. It is a container,
not a second format: unpacking one gives the folder back byte for byte. Everything
here reads either form and cannot tell the difference.

`manifest.json`, `tokens.json`, `typography.json` and `components.json` are the
four a snapshot cannot be read without. `dependencies.json` is optional in the
format, but without it there are no links to draw — the viewer opens the snapshot
and says so rather than refusing it.

Variables and typography use the [Design Tokens Community Group
format](https://www.designtokens.org/TR/2025.10/format/) version 2025.10, which is
a real interoperable standard rather than something invented here. The component
inventory and the dependency layer use local schemas, because no standard for
either exists yet.

Two consequences of using the standard are worth knowing, because they shape
everything below:

- **Token names are dotted paths, not slash paths.** A Figma variable named
  `Color/foreground` becomes the path `Color.foreground`, because the standard uses
  `/` inside names and forbids `.`. The original Figma name is always preserved
  alongside it.
- **The standard has no concept of themes.** So each collection × theme gets its
  own file, and `tokens.json` holds only each collection's default theme.
  The themes are put back together when the
  snapshot is read — see [`modes`](#nodes) below.

**This repo does not produce snapshots.** They are captured from Figma through the
bridge plugin by the `ds-snapshot` skill, which owns the format and validates it.
Run that validator before relying on a snapshot; this repo trusts it and only
checks what it must.

### What the snapshot records, and what the map makes of it

| In the snapshot | Becomes |
|---|---|
| `tokens.json` leaf tokens | `token` and `primitive` nodes |
| `tokens/<collection>.<mode>.json` | each node's `modes` map |
| `typography.json` | `textStyle` nodes |
| `components.json` | `component` nodes |
| `dependencies.json` → `aliases` | `ALIASES` links, one per theme |
| `dependencies.json` → `bindings` | `BINDS` links |
| `dependencies.json` → `nests` | `NESTS` links |
| `dependencies.json` → `typography` | `USES_TEXT_STYLE` links |
| `dependencies.json` → `nestsUncaptured` | `NESTS` links to an `external` component |
| `dependencies.json` → `unresolvedBindings` | `BINDS` links to an `unresolved` token |

The last two are gaps the snapshot records on purpose, and they survive into the
map rather than being dropped. A binding to a variable the snapshot does not hold,
and a nested component that was never walked, are both findings.

---

## The map

What reading a snapshot produces, in memory. It is not a file — this section
describes what the viewer draws and what `query.mjs` walks.

```json
{
  "meta": { … },
  "nodes": [ … ],
  "edges": [ … ]
}
```

### `meta`

| Field | Type | Notes |
|---|---|---|
| `generatedAt` | ISO 8601 timestamp | when the snapshot was read |
| `snapshot` | ISO 8601 timestamp | when the capture was taken |
| `source` | string | human-readable description of the library |
| `files` | string[] | the Figma files walked for components |
| `componentCount` | number | |
| `variableCount` | number | |
| `textStyleCount` | number | |
| `modes` | string[] | every theme name in the library |

### `nodes`

Every node has `id` and `kind`. The `id` is a stable, readable string — no Figma
ids survive into this layer. Four kinds.

**`kind: "token"`** and **`kind: "primitive"`** — id is the dotted token path.

```json
{
  "id": "Button.button-primary-background",
  "kind": "token",
  "name": "Button/button-primary-background",
  "collection": "Tokens",
  "valueType": "color",
  "figmaType": "COLOR",
  "modes": {
    "educator ds global (light)": "{green.green-500}",
    "parent ds TFamily (light)": "{blue.blue-600}"
  }
}
```

`name` is the original Figma name, so it keeps its slashes and reads the way a
designer expects. `collection` is the Figma variable collection; the one named
exactly **`Primitives`** becomes `primitive` nodes and everything else becomes
`token` nodes, which is the one convention this repo hard-codes.

`valueType` is the standard's type — `color`, `dimension`, `number`, `fontFamily`,
`string`. `figmaType` is the Figma type it came from (`COLOR`, `FLOAT`, `STRING`).

`modes` maps a theme name to that token's value in that theme. A value is one of:

- **a reference** — `"{green.green-500}"`, the id of another node. This is what
  becomes the `ALIASES` links, and a token with five themes can point at five
  different targets.
- **a colour** — `{ "colorSpace": "srgb", "components": [0.16, 0.53, 0.13], "alpha": 1, "hex": "#2a8722" }`,
  channels `0`–`1`, with `hex` for convenience.
- **a size** — `{ "value": 12, "unit": "px" }`
- **a plain number or string**

A token may also carry `unresolved: true`, with no `modes` and no `collection`.
That means a component binds it but the snapshot does not hold it — usually a
variable from a library that was not exported. Its `id` is the raw Figma label.

**`kind: "textStyle"`** — id is `"TextStyle/<dotted path>"`.

```json
{
  "id": "TextStyle/Roboto.base medium",
  "kind": "textStyle",
  "name": "Roboto/base medium",
  "family": "Roboto",
  "fontSize": 16,
  "fontWeight": 500,
  "lineHeight": 1.5,
  "letterSpacing": 0,
  "figmaFontStyle": "Medium",
  "figmaLineHeight": { "unit": "PERCENT", "value": 150 }
}
```

`lineHeight` is a multiplier of the font size, which is what the standard uses.
`figmaLineHeight` keeps the original so nothing is lost in the conversion; it is
absent from `lineHeight` only when Figma reported `AUTO`, which has no faithful
numeric equivalent. `family` may be a reference like `"{Font.Family.Roboto}"` when
the style's font comes from a variable.

**`kind: "component"`** — id is `"Component/<slug path>"`.

```json
{
  "id": "Component/button",
  "kind": "component",
  "name": "Button",
  "path": [],
  "source": "2. Components",
  "figmaType": "COMPONENT_SET",
  "figmaUrl": "https://www.figma.com/design/…?node-id=10-41",
  "variants": { "Size": ["Large", "Medium", "Small"] },
  "variantCount": 195,
  "description": "…",
  "deprecated": true
}
```

`name` is the last segment of the Figma name and `path` the preceding groups, so
`Web/Header` is `name: "Header"`, `path: ["Web"]`. `source` is the Figma file the
component came from, and the link is built against that file — which matters once
a snapshot spans more than one.

`variantCount` is how many variants the set actually contains, not the product of
the axis lengths. Where the two differ the set has gaps, which is useful audit
signal. `description` and `deprecated` are absent when empty or false.

A component may instead carry `external: true` with no other fields — something
nested it, but it was never walked, so its own dependencies are unknown.

### `edges`

Every edge is `{ from, to, type, … }`, where `from` and `to` are node ids. Four
types, each with its own extra field:

| `type` | Meaning | Extra |
|---|---|---|
| `BINDS` | A component uses a token or primitive | `props`: string[] — the Figma properties bound, e.g. `["fills", "paddingLeft"]` |
| `ALIASES` | A token points at another token or primitive | `mode`: string — one edge per theme, so the same pair can repeat |
| `NESTS` | A component contains another component | `count`: number — instances found |
| `USES_TEXT_STYLE` | A component uses a text style | none |

```json
[
  { "from": "Color.foreground", "to": "grey.grey-900",
    "type": "ALIASES", "mode": "educator ds global (light)" },
  { "from": "Component/card", "to": "grey.grey-200",
    "type": "BINDS", "props": ["strokes"] },
  { "from": "Component/card", "to": "Component/chevron",
    "type": "NESTS", "count": 12 },
  { "from": "Component/card", "to": "TextStyle/Roboto.base medium",
    "type": "USES_TEXT_STYLE" }
]
```

Edges are a flat list and are not deduplicated — `ALIASES` deliberately repeats per
theme. An edge may point at a node that exists only because it was auto-created
(`unresolved` tokens, `external` components), but it never points at a missing
node: a link to something the snapshot doesn't name is dropped and counted in a
warning, because drawing it would invent a node.

---

## What the viewer checks

**Load snapshot…** takes either the single `.bundle.json` or a snapshot folder. A
browser file picker handles one or the other, never both, so the modal offers each
separately — the button in the header opens the file picker.

These are refused, with a message naming what's wrong:

- not valid JSON
- a single file that isn't a bundle — one `tokens.json` on its own is not a snapshot
- any of `manifest.json`, `tokens.json`, `typography.json`, `components.json` missing
- `components.json` with no `components` list, or `dependencies.json` missing one
  of its two lists

These open with a warning instead, because a partial snapshot still answers most
questions:

- no `dependencies.json` — the inventory is shown, with no links
- per-theme token files missing — those tokens show no value per theme
- links pointing at something the snapshot doesn't name — dropped, and counted

Anything else in the snapshot is left alone, so one written by a newer version of
the skill still opens. A refused snapshot changes nothing: whatever was already on
screen stays there.

## Pointing this at another library

1. Capture the library with the `ds-snapshot` skill, asking for the dependency
   layer, and let its validator pass.
2. Open it: **Load snapshot…** in the viewer, or `node query.mjs --snapshot <path>`
   from the terminal. Nothing to build in between.
3. Optionally copy it to `viewer/src/snapshot.json` to have it baked into the build.

The `Primitives` collection name is the one convention this repo hard-codes;
everything else is derived from the data.
