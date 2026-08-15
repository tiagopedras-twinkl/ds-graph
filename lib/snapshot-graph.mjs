// Turns a ds-snapshot into the node-and-link map the viewer draws and the CLI
// walks. This is the only place that reads the snapshot format, and it is shared
// by the viewer and query.mjs so there is one interpretation of a snapshot, not
// two that can drift.
//
// Input is a plain map of contract path -> parsed JSON:
//
//   { "manifest.json": {...}, "tokens.json": {...}, "tokens/primitives.value.json": {...}, … }
//
// which is what both a snapshot folder and the single-file bundle hold. No file
// reading happens here — that is the caller's job, because the browser and Node
// get at files in completely different ways. Nothing in this file may import
// from "node:*"; the viewer bundles it.
//
// The format belongs to the ds-snapshot skill, which writes and validates it:
// see its references/output-contract.md.

export const SNAPSHOT_FILES = {
  manifest: "manifest.json",
  tokens: "tokens.json",
  typography: "typography.json",
  components: "components.json",
  dependencies: "dependencies.json",
};

// Every file the graph cannot be built without. dependencies.json is not here:
// without it a snapshot still lists what the library holds, it just has no links.
const REQUIRED = [
  SNAPSHOT_FILES.manifest,
  SNAPSHOT_FILES.tokens,
  SNAPSHOT_FILES.typography,
  SNAPSHOT_FILES.components,
];

export class SnapshotError extends Error {}

// A bundle nests each snapshot file's content verbatim under its contract path,
// so unwrapping one is the whole conversion. Anything else is assumed to be a
// files map already.
export function filesFromBundle(doc) {
  if (doc && typeof doc === "object" && !Array.isArray(doc) && doc.files && typeof doc.files === "object") {
    return doc.files;
  }
  return null;
}

// Errors are written for whoever is holding the wrong file, not for whoever
// wrote this code.
export function checkSnapshotFiles(files) {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new SnapshotError("That isn't a snapshot. Expected the files of one, or a snapshot bundle.");
  }
  const names = Object.keys(files);
  if (names.length === 0) throw new SnapshotError("No files in that snapshot.");

  const missing = REQUIRED.filter((f) => !files[f]);
  if (missing.length) {
    throw new SnapshotError(
      `A snapshot needs ${REQUIRED.join(", ")}. ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} missing. ` +
        `If you picked a single file, it should be the .bundle.json; if you picked a folder, include everything in it.`,
    );
  }
  for (const f of REQUIRED) {
    if (typeof files[f] !== "object" || files[f] === null || Array.isArray(files[f])) {
      throw new SnapshotError(`${f} in that snapshot isn't a JSON object.`);
    }
  }
  if (!Array.isArray(files[SNAPSHOT_FILES.components].components)) {
    throw new SnapshotError(`components.json needs a "components" list in it.`);
  }
  const deps = files[SNAPSHOT_FILES.dependencies];
  if (deps && (!Array.isArray(deps.aliases) || !Array.isArray(deps.components))) {
    throw new SnapshotError(`dependencies.json needs both an "aliases" list and a "components" list.`);
  }
}

// --- walk a DTCG document into path -> { type, value, extensions } ---
const NS_SUFFIX = ".ds-snapshot";
const nsPayload = (extensions = {}) => {
  const key = Object.keys(extensions).find((k) => k.endsWith(NS_SUFFIX));
  return key ? (extensions[key] ?? {}) : {};
};
function collect(node, inherited, out = new Map(), trail = []) {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("$") || typeof value !== "object" || value === null) continue;
    const type = value.$type ?? inherited;
    if ("$value" in value) {
      out.set([...trail, key].join("."), {
        type,
        value: value.$value,
        ext: nsPayload(value.$extensions),
      });
    } else collect(value, type, out, [...trail, key]);
  }
  return out;
}

export function snapshotGraph(files) {
  checkSnapshotFiles(files);
  const warnings = [];

  const manifest = files[SNAPSHOT_FILES.manifest];
  const deps = files[SNAPSHOT_FILES.dependencies] ?? null;
  const tokens = collect(files[SNAPSHOT_FILES.tokens]);
  const typography = collect(files[SNAPSHOT_FILES.typography]);
  const inventory = files[SNAPSHOT_FILES.components].components;

  if (!deps) {
    warnings.push(
      "This snapshot has no dependency layer, so there are no links to draw. Re-run the snapshot and ask for dependencies.",
    );
  }

  // --- per-theme values, and which collection each token belongs to ---
  // The token format has no concept of themes, so the snapshot splits them across
  // files. Putting them back together is what lets the viewer show a token per theme.
  const modesOf = new Map(); // token path -> { mode: value }
  const collectionOf = new Map(); // token path -> Figma collection name
  let modeFilesRead = 0;
  let modeFilesDeclared = 0;
  for (const file of manifest.files ?? []) {
    if (file.kind !== "tokens-mode") continue;
    modeFilesDeclared++;
    const doc = files[file.path];
    if (!doc) continue;
    modeFilesRead++;
    for (const [tokenPath, t] of collect(doc)) {
      if (!modesOf.has(tokenPath)) modesOf.set(tokenPath, {});
      modesOf.get(tokenPath)[file.mode] = t.value;
      collectionOf.set(tokenPath, file.collection);
    }
  }
  if (modeFilesDeclared && modeFilesRead < modeFilesDeclared) {
    warnings.push(
      `${modeFilesDeclared - modeFilesRead} of ${modeFilesDeclared} per-theme token files are missing, so some tokens won't show a value per theme.`,
    );
  }

  const nodes = new Map();
  const edges = [];
  const addNode = (id, data) => {
    if (!nodes.has(id)) nodes.set(id, { id, ...data });
  };
  const addEdge = (from, to, type, extra = {}) => edges.push({ from, to, type, ...extra });

  // --- tokens and primitives ---
  // The `Primitives` collection is the raw-value layer, the same convention the
  // Figma library uses. Everything else is a token.
  for (const [tokenPath, t] of tokens) {
    const collection = collectionOf.get(tokenPath) ?? "";
    addNode(tokenPath, {
      kind: collection === "Primitives" ? "primitive" : "token",
      name: t.ext.figmaName ?? tokenPath,
      collection,
      valueType: t.type ?? "",
      figmaType: t.ext.figmaType ?? "",
      modes: modesOf.get(tokenPath) ?? {},
    });
  }

  // --- text styles ---
  for (const [stylePath, t] of typography) {
    const v = t.value ?? {};
    addNode(`TextStyle/${stylePath}`, {
      kind: "textStyle",
      name: t.ext.figmaName ?? stylePath,
      family: v.fontFamily,
      fontSize: v.fontSize?.value,
      fontWeight: v.fontWeight,
      lineHeight: v.lineHeight,
      letterSpacing: v.letterSpacing?.value,
      figmaFontStyle: t.ext.figmaFontStyle,
      figmaLineHeight: t.ext.figmaLineHeight,
    });
  }

  // --- components ---
  // A snapshot can span several Figma files, so a link has to be built against the
  // file the component came from rather than the one the tokens came from.
  const keyByFileName = new Map(
    (manifest.dependencies?.sources ?? [])
      .filter((s) => s.figmaFileKey)
      .map((s) => [s.figmaFileName, s.figmaFileKey]),
  );
  if (manifest.source?.figmaFileName && manifest.source.figmaFileKey) {
    keyByFileName.set(manifest.source.figmaFileName, manifest.source.figmaFileKey);
  }
  const figmaUrl = (c) => {
    const key = keyByFileName.get(c.source);
    if (!key || !c.figma?.nodeId) return undefined;
    const slug = encodeURIComponent(c.source ?? "");
    // Figma's own links use `-` in place of `:` in the node-id query param.
    return `https://www.figma.com/design/${key}/${slug}?node-id=${c.figma.nodeId.replace(":", "-")}`;
  };

  for (const c of inventory) {
    addNode(`Component/${c.id}`, {
      kind: "component",
      name: c.name,
      path: c.path,
      source: c.source,
      figmaType: c.kind === "componentSet" ? "COMPONENT_SET" : "COMPONENT",
      figmaUrl: figmaUrl(c),
      variants: c.variants,
      variantCount: c.variantCombinations,
      deprecated: c.deprecated || undefined,
      description: c.description || undefined,
    });
  }

  // --- the links ---
  for (const a of deps?.aliases ?? []) addEdge(a.from, a.to, "ALIASES", { mode: a.mode });

  for (const c of deps?.components ?? []) {
    const from = `Component/${c.id}`;
    for (const b of c.bindings ?? []) addEdge(from, b.token, "BINDS", { props: b.properties });
    for (const t of c.typography ?? []) addEdge(from, `TextStyle/${t}`, "USES_TEXT_STYLE");
    for (const n of c.nests ?? []) addEdge(from, `Component/${n.id}`, "NESTS", { count: n.count });

    // Something nested but never walked still gets a node, marked external, so the
    // dependency stays visible instead of vanishing.
    for (const n of c.nestsUncaptured ?? []) {
      const id = `Component/${n.name}`;
      addNode(id, { kind: "component", name: n.name, external: true });
      addEdge(from, id, "NESTS", { count: n.count });
    }
    // A binding to a variable the snapshot does not hold is recorded, not dropped —
    // a dangling link is a finding.
    for (const u of c.unresolvedBindings ?? []) {
      addNode(u.figmaName, { kind: "token", name: u.figmaName, unresolved: true });
      addEdge(from, u.figmaName, "BINDS", { props: u.properties });
    }
  }

  // A link to something the snapshot doesn't name would draw a node out of thin
  // air, so it is dropped and counted rather than shown. The snapshot validator
  // reports exactly which, and a valid snapshot has none.
  const drawable = edges.filter((e) => nodes.has(e.from) && nodes.has(e.to));
  if (drawable.length !== edges.length) {
    const n = edges.length - drawable.length;
    warnings.push(
      `${n} link${n === 1 ? "" : "s"} point at something this snapshot doesn't name, so ${n === 1 ? "it isn't" : "they aren't"} shown. Validating the snapshot says which.`,
    );
  }

  return {
    graph: {
      meta: {
        generatedAt: new Date().toISOString(),
        source: `Figma — ${manifest.source?.figmaFileName ?? "snapshot"}`,
        snapshot: manifest.exportedAt,
        files: (manifest.dependencies?.sources ?? []).map((s) => s.figmaFileName),
        componentCount: inventory.length,
        variableCount: tokens.size,
        textStyleCount: typography.size,
        modes: [...new Set((manifest.collections ?? []).flatMap((c) => c.modes ?? []))],
      },
      nodes: [...nodes.values()],
      edges: drawable,
    },
    warnings,
  };
}
