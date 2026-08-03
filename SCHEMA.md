# Data format

This repo ships the tooling, not the data. The snapshot it was built against is a
private design system library, so `snapshot/` is not committed. This file
describes exactly what the tooling expects, so it can be pointed at another Figma
library.

There are two layers:

1. **`snapshot/raw/*.json`** — captured from Figma, one file per kind of thing.
2. **`snapshot/graph.json`** — the single file `build.mjs` produces from the raw
   capture. Everything downstream (`query.mjs`, the viewer) reads only this.

A small synthetic example of layer 2 lives in
[`snapshot/graph.example.json`](snapshot/graph.example.json) — real structure,
invented names.

**If you just want to audit your own library in the viewer, only layer 2 matters.**
The viewer's **Load snapshot…** button takes a single `graph.json` and needs
nothing else — see [what the viewer checks](#what-the-viewer-checks) for the exact
rules it enforces on a file you load.

---

## Layer 1 — raw capture

All paths are relative to `snapshot/raw/`. Field names match the Figma Plugin API,
because the capture is close to a direct dump.

### `variables.json`

Every variable in the library — both raw values and the tokens that point at
them. An array of:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Figma's internal id, e.g. `VariableID:<key>/<node>`. Only used to resolve aliases; never appears in the output. |
| `name` | string | Path within the collection, e.g. `Text/text-default`. |
| `key` | string | Figma's published key. Not used by `build.mjs`. |
| `collection` | string | The variable collection. `Primitives` is special — see below. |
| `type` | `COLOR` \| `FLOAT` \| `STRING` | |
| `remote` | boolean | True if it comes from a linked library. Not used. |
| `scopes` | string[] | Figma scopes, e.g. `["ALL_SCOPES"]`. Not used. |
| `modes` | object | Mode name → value. **The important field.** |

`modes` maps a mode name (a theme, in practice) to one of:

- a number — `0`, `16`
- a colour — `{ "r": 0.03, "g": 0.18, "b": 0.29, "a": 1 }`, channels `0`–`1`
- a string
- **an alias** — `{ "alias": "VariableID:<key>/<node>" }`, pointing at another
  variable's `id`

Aliases are what become the `ALIASES` links. A variable with five modes can alias
five different targets, and each is recorded separately.

```json
[
  {
    "id": "VariableID:<key>/<node>",
    "name": "Text/text-default",
    "key": "<key>",
    "collection": "Tokens",
    "type": "COLOR",
    "remote": true,
    "scopes": ["ALL_SCOPES"],
    "modes": {
      "brand a (light)": { "alias": "VariableID:<key>/<node>" },
      "brand a (dark)":  { "alias": "VariableID:<other-key>/<node>" }
    }
  }
]
```

The collection named exactly **`Primitives`** is treated as the raw-value layer;
its variables become `primitive` nodes. Everything else becomes a `token` node.
Renaming that collection in Figma changes the output, so it is a hard-coded
convention in `build.mjs`.

### `batch-*.json`

The components, split across however many files. Any file starting with `batch-`
is read and concatenated, so the split points don't matter — they only exist
because the capture runs in chunks. An array of:

| Field | Type | Notes |
|---|---|---|
| `name` | string | Component or component-set name. Used as the identity — see the name-collision caveat in the README. |
| `page` | string | Figma page it lives on. |
| `type` | `COMPONENT_SET` \| `COMPONENT` | |
| `key` | string | Figma's published key. Not used by `build.mjs`. |
| `variants` | object | Axis name → list of values. `{}` or absent for a plain component. |
| `bindings` | array | Variable bindings. See below. |
| `instances` | object | Nested component name → how many times it appears. |
| `textStyles` | string[] | Figma text style ids used, matching `id` in `textstyles.json`. |

`bindings` is an array of **pairs**, not objects: `[variableLabel, propertyNames]`.
The label is `"<collection>/<name>"` — the same two fields from `variables.json`
joined with a slash. That string is how the two files are linked together; there
is no id matching.

```json
[
  {
    "name": "Card",
    "page": "Surfaces",
    "type": "COMPONENT_SET",
    "key": "<key>",
    "variants": {
      "Size": ["sm", "md", "lg"],
      "State": ["Default", "Hover", "Active", "Disabled"]
    },
    "bindings": [
      ["Primitives/grey/grey-200", ["strokes"]],
      ["Spacing/spacing-100", ["itemSpacing", "paddingTop", "paddingLeft"]]
    ],
    "instances": { "Chevron": 9, ".Card header": 3 },
    "textStyles": ["S:<key>,<node>"]
  }
]
```

A binding whose label matches no variable is **kept**, as a `token` node marked
`unresolved: true`. A dangling link is a finding, not something to drop.

### `textstyles.json`

An array of:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Figma style id, e.g. `S:<key>,<node>`. Matched against `textStyles` in the batch files. |
| `name` | string | e.g. `Inter/base regular`. |
| `key` | string | Not used. |
| `fontSize` | number | |
| `family` | string | |
| `style` | string | e.g. `Regular`, `Medium`. |
| `lineHeight` | object | `{ "unit": "PERCENT" \| "PIXELS" \| "AUTO", "value": 150 }` |
| `variableBound` | boolean | Whether the size comes from a variable. |

### `figma-node-ids.json` — optional

Only needed to give components a clickable `figmaUrl`. Absent, they simply get
none, and nothing else changes. An array of `{ name, id, page, type }`, where
`id` is a node id like `1203:45` and `name` matches the batch files.

### `source.json` — optional

Identifies the library the snapshot came from, so the file key isn't baked into
the code. Absent, components get no `figmaUrl` even when node ids are present.

```json
{
  "fileKey": "<your Figma file key>",
  "fileName": "<the file's name, used for the link text>"
}
```

The file key is the segment after `/design/` in a Figma URL. This file is
gitignored along with the rest of the snapshot, since it points at a specific
private library.

---

## Layer 2 — `graph.json`

The build output, and the only thing the viewer and `query.mjs` read.

```json
{
  "meta": { … },
  "nodes": [ … ],
  "edges": [ … ]
}
```

### `meta`

| Field | Type |
|---|---|
| `generatedAt` | ISO 8601 timestamp |
| `source` | string, human-readable description of the library |
| `componentCount` | number |
| `variableCount` | number |
| `textStyleCount` | number |

### `nodes`

Every node has `id` and `kind`. The `id` is a stable, readable string — no Figma
ids survive into this layer. Four kinds:

**`kind: "token"`** and **`kind: "primitive"`** — id is `"<collection>/<name>"`.

```json
{
  "id": "Spacing/spacing-0",
  "kind": "token",
  "name": "spacing-0",
  "collection": "Spacing",
  "valueType": "FLOAT",
  "modes": { "Mode 1": 0 }
}
```

`modes` carries the same shape as the raw capture, except that alias targets are
rewritten from Figma ids to readable labels: `{ "alias": "Primitives/grey/grey-900" }`.
A token may also carry `unresolved: true` (see `bindings` above).

**`kind: "textStyle"`** — id is `"TextStyle/<name>"`, and it carries `name`,
`fontSize`, `family`, `style`, `lineHeight`, `variableBound`.

**`kind: "component"`** — id is `"Component/<name>"`.

```json
{
  "id": "Component/Card",
  "kind": "component",
  "name": "Card",
  "page": "Surfaces",
  "figmaType": "COMPONENT_SET",
  "figmaUrl": "https://www.figma.com/design/…?node-id=1203-45",
  "variants": { "Size": ["sm", "md", "lg"] },
  "variantCount": 12
}
```

`variantCount` is the product of the axis lengths, so it is the size of the full
matrix rather than a count of variants that actually exist. `figmaUrl` is absent
without `figma-node-ids.json` and `source.json`. A component may instead carry
`external: true` with no other fields — that means something nested it, but it
was never captured (an icon from another page, or a private part).

### `edges`

Every edge is `{ from, to, type, … }`, where `from` and `to` are node ids. Four
types, each with its own extra field:

| `type` | Meaning | Extra |
|---|---|---|
| `BINDS` | A component uses a token or primitive | `props`: string[] — the Figma properties bound, e.g. `["fills", "paddingLeft"]` |
| `ALIASES` | A token points at another token or primitive | `mode`: string — one edge per mode, so the same pair can repeat |
| `NESTS` | A component contains another component | `count`: number — instances found |
| `USES_TEXT_STYLE` | A component uses a text style | none |

```json
[
  { "from": "Tokens/Text/text-default", "to": "Primitives/grey/grey-900",
    "type": "ALIASES", "mode": "brand a (light)" },
  { "from": "Component/Card", "to": "Primitives/grey/grey-200",
    "type": "BINDS", "props": ["strokes"] },
  { "from": "Component/Card", "to": "Component/Chevron",
    "type": "NESTS", "count": 12 },
  { "from": "Component/Card", "to": "TextStyle/Inter/base medium",
    "type": "USES_TEXT_STYLE" }
]
```

Edges are a flat list, in build order, and are not deduplicated — `ALIASES`
deliberately repeats per mode. An edge may point at a node id that exists only
because it was auto-created (`unresolved` tokens, `external` components), but it
never points at a missing node.

---

## What the viewer checks

When you load a `graph.json` through **Load snapshot…**, these are refused, with a
message naming the file and the offending node or link:

- not valid JSON, or not a JSON object
- no `nodes` array, or no `edges` array — the usual cause is handing it a raw
  capture instead of a built graph
- an empty `nodes` array
- a node with no `id`, or two nodes sharing one
- a node whose `kind` isn't one of the four above
- a link missing `from`, `to`, or `type`

These load with a warning instead, because a partial graph still answers most
questions:

- links pointing at a node that isn't in the file — ignored
- link types other than the four above — drawn, but not described in plain language

Anything else in the file is left alone, so a snapshot from a newer build than the
viewer still opens. A refused file changes nothing: whatever was already on screen
stays there.

## Pointing this at another library

1. Capture the four raw files into `snapshot/raw/` in the shapes above, plus
   `snapshot/source.json` if you want Figma links.
2. `node build.mjs` → writes `snapshot/graph.json`.
3. Either load that file in the viewer with **Load snapshot…**, or copy it to
   `viewer/src/graph.json` to have it baked into the build.

The `Primitives` collection name is the one convention `build.mjs` hard-codes;
everything else is derived from the data.
