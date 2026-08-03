// Turns snapshot/raw/*.json into a single graph.json.
// Input is a Figma snapshot only — no code is read.
import fs from "node:fs";
import path from "node:path";

const RAW = "snapshot/raw";
const read = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f), "utf8"));

const components = fs
  .readdirSync(RAW)
  .filter((f) => f.startsWith("batch-"))
  .flatMap((f) => read(f));
const variables = read("variables.json");
const textStyles = read("textstyles.json");

// Optional: node ids for direct Figma links, keyed by component name. Not
// part of the original capture (see build.mjs's component loop below) — it's
// a lighter, separate pull since it only needs name+id, not the full binding
// walk. Absent this file, components just get no figmaUrl.
// The library itself is identified in snapshot/source.json, which is not
// committed — it points at one specific private file. Without it, no figmaUrl.
const source = fs.existsSync("snapshot/source.json")
  ? JSON.parse(fs.readFileSync("snapshot/source.json", "utf8"))
  : {};
const FIGMA_FILE_KEY = source.fileKey;
const FIGMA_FILE_NAME = source.fileName || "";
let figmaNodeIdByName = new Map();
if (fs.existsSync(path.join(RAW, "figma-node-ids.json"))) {
  figmaNodeIdByName = new Map(
    read("figma-node-ids.json").map((n) => [n.name, n.id]),
  );
}
const figmaUrl = (name) => {
  const nodeId = figmaNodeIdByName.get(name);
  if (!nodeId || !FIGMA_FILE_KEY) return undefined;
  const slug = encodeURIComponent(FIGMA_FILE_NAME);
  // Figma's own links use `-` in place of `:` in the node-id query param.
  return `https://www.figma.com/design/${FIGMA_FILE_KEY}/${slug}?node-id=${nodeId.replace(":", "-")}`;
};

const nodes = new Map();
const edges = [];
const addNode = (id, data) => {
  if (!nodes.has(id)) nodes.set(id, { id, ...data });
  return nodes.get(id);
};
const addEdge = (from, to, type, extra = {}) =>
  edges.push({ from, to, type, ...extra });

// --- variables: primitives, tokens, and the alias links between them ---
const byId = new Map(variables.map((v) => [v.id, v]));
const label = (v) => `${v.collection}/${v.name}`;

for (const v of variables) {
  const isPrimitive = v.collection === "Primitives";
  // Rewrite alias targets from raw Figma ids to readable labels, so nothing
  // downstream has to carry the id table around.
  const modes = {};
  for (const [mode, value] of Object.entries(v.modes || {})) {
    if (value && typeof value === "object" && value.alias) {
      const t = byId.get(value.alias);
      modes[mode] = { alias: t ? label(t) : value.alias };
    } else modes[mode] = value;
  }
  addNode(label(v), {
    kind: isPrimitive ? "primitive" : "token",
    name: v.name,
    collection: v.collection,
    valueType: v.type,
    modes,
  });
}

for (const v of variables) {
  for (const [mode, value] of Object.entries(v.modes || {})) {
    if (value && typeof value === "object" && value.alias) {
      const target = byId.get(value.alias);
      if (target) addEdge(label(v), label(target), "ALIASES", { mode });
    }
  }
}

// --- text styles ---
for (const s of textStyles) {
  addNode(`TextStyle/${s.name}`, {
    kind: "textStyle",
    name: s.name,
    fontSize: s.fontSize,
    family: s.family,
    style: s.style,
    lineHeight: s.lineHeight,
    variableBound: s.variableBound,
  });
}
const styleById = new Map(textStyles.map((s) => [s.id, s]));

// --- components, and what they bind ---
for (const c of components) {
  addNode(`Component/${c.name}`, {
    kind: "component",
    name: c.name,
    page: c.page,
    figmaType: c.type,
    figmaUrl: figmaUrl(c.name),
    variants: c.variants,
    variantCount: Object.values(c.variants || {}).reduce(
      (a, vals) => a * vals.length,
      1,
    ),
  });

  for (const [varLabel, props] of c.bindings) {
    // A binding to something we never resolved is recorded, not dropped —
    // a dangling link is a finding, not a reason to lose the edge.
    if (!nodes.has(varLabel))
      addNode(varLabel, { kind: "token", name: varLabel, unresolved: true });
    addEdge(`Component/${c.name}`, varLabel, "BINDS", { props });
  }

  for (const [child, count] of Object.entries(c.instances || {}))
    addEdge(`Component/${c.name}`, `Component/${child}`, "NESTS", { count });

  for (const sid of c.textStyles || []) {
    const s = styleById.get(sid);
    if (s) addEdge(`Component/${c.name}`, `TextStyle/${s.name}`, "USES_TEXT_STYLE");
  }
}

// Nested instances often point at icons or private parts that are not
// top-level components in this file. Mark them so the viewer can dim them.
for (const e of edges) {
  if (e.type === "NESTS" && !nodes.has(e.to))
    addNode(e.to, {
      kind: "component",
      name: e.to.replace("Component/", ""),
      external: true,
    });
}

const graph = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: FIGMA_FILE_NAME ? `Figma — ${FIGMA_FILE_NAME}` : "Figma snapshot",
    componentCount: components.length,
    variableCount: variables.length,
    textStyleCount: textStyles.length,
  },
  nodes: [...nodes.values()],
  edges,
};

fs.writeFileSync("snapshot/graph.json", JSON.stringify(graph, null, 1));

const byKind = {};
for (const n of graph.nodes) byKind[n.kind] = (byKind[n.kind] || 0) + 1;
const byType = {};
for (const e of graph.edges) byType[e.type] = (byType[e.type] || 0) + 1;
console.log("nodes:", byKind);
console.log("edges:", byType);
console.log("written: snapshot/graph.json");
