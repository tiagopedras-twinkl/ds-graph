// Where the graph comes from: a built-in default at startup, or a file the user
// picks at runtime so they can audit their own library without rebuilding.
//
// The real snapshot is private and not committed (see SCHEMA.md), so
// ../graph.json may legitimately be absent. `import.meta.glob` resolves to an
// empty object in that case instead of failing the build, which a plain static
// import cannot do.
//
// The example is imported rather than fetched on demand because the production
// build is a single HTML file meant to open from file://, where fetch() of a
// sibling file is blocked. Anything the viewer needs offline has to be bundled.
import example from "../../../snapshot/graph.example.json";
import { KINDS } from "./graph";

const localModules = import.meta.glob("../graph.json", {
  eager: true,
  import: "default",
});
const local = Object.values(localModules)[0];

const EDGE_TYPES = ["BINDS", "ALIASES", "NESTS", "USES_TEXT_STYLE"];

export const exampleSnapshot = {
  graph: example,
  source: "built-in example",
  isExample: true,
  warnings: [],
};

export const initialSnapshot = local
  ? { graph: local, source: "snapshot/graph.json", isExample: false, warnings: [] }
  : exampleSnapshot;

// Counted from the graph rather than read from `meta`, so the header stays
// honest for a file whose meta is stale, partial or missing altogether.
export function describeSnapshot(graph) {
  let components = 0;
  let variables = 0;
  let textStyles = 0;
  for (const n of graph.nodes) {
    if (n.kind === "component") components++;
    else if (n.kind === "token" || n.kind === "primitive") variables++;
    else if (n.kind === "textStyle") textStyles++;
  }
  const generatedAt = Date.parse(graph.meta?.generatedAt ?? "");
  return {
    components,
    variables,
    textStyles,
    links: graph.edges.length,
    generatedAt: Number.isNaN(generatedAt) ? null : new Date(generatedAt),
  };
}

// Strict about the shape the traversal depends on, lenient about anything
// extra: a snapshot from a newer build may carry fields this viewer predates,
// and rejecting it for that would be wrong. Errors are written to be read by
// someone holding the wrong file, not by whoever wrote this code.
export function parseSnapshot(text, filename) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`${filename} isn't valid JSON. ${e.message}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${filename} should hold a JSON object with "nodes" and "edges" in it.`);
  }
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error(
      `${filename} needs both a "nodes" list and an "edges" list. If this is a raw Figma capture rather than a built graph, run it through build.mjs first.`,
    );
  }
  if (data.nodes.length === 0) throw new Error(`${filename} has no nodes in it.`);

  const ids = new Set();
  data.nodes.forEach((n, i) => {
    if (!n || typeof n.id !== "string" || n.id === "") {
      throw new Error(`${filename}: node ${i} has no "id".`);
    }
    if (ids.has(n.id)) {
      throw new Error(`${filename}: "${n.id}" appears twice in "nodes".`);
    }
    if (!KINDS.includes(n.kind)) {
      throw new Error(
        `${filename}: node "${n.id}" has kind "${n.kind}". Expected one of ${KINDS.join(", ")}.`,
      );
    }
    ids.add(n.id);
  });

  let dangling = 0;
  const unknownTypes = new Set();
  data.edges.forEach((e, i) => {
    if (!e || typeof e.from !== "string" || typeof e.to !== "string") {
      throw new Error(`${filename}: link ${i} needs both a "from" and a "to".`);
    }
    if (typeof e.type !== "string" || e.type === "") {
      throw new Error(`${filename}: the link from "${e.from}" to "${e.to}" has no "type".`);
    }
    if (!ids.has(e.from) || !ids.has(e.to)) dangling++;
    if (!EDGE_TYPES.includes(e.type)) unknownTypes.add(e.type);
  });

  // Both of these are survivable, so they inform rather than block: a partial
  // graph still answers most questions, and refusing to open it helps nobody.
  const warnings = [];
  if (dangling) {
    warnings.push(
      dangling === 1
        ? "1 link points at a node that isn't in the file. It won't show up."
        : `${dangling} links point at a node that isn't in the file. They won't show up.`,
    );
  }
  if (unknownTypes.size) {
    warnings.push(
      `Unrecognised link type${unknownTypes.size === 1 ? "" : "s"}: ${[...unknownTypes].join(", ")}. Shown, but not labelled in plain language.`,
    );
  }

  return { graph: data, source: filename, isExample: false, warnings };
}

export function readSnapshotFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Couldn't read ${file.name}.`));
    reader.onload = () => {
      try {
        resolve(parseSnapshot(String(reader.result), file.name));
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsText(file);
  });
}
