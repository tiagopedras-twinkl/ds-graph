// Where the graph on screen comes from: a ds-snapshot the user opens, or a
// built-in one at startup. The viewer reads snapshots and nothing else — there is
// no intermediate file to go stale, and the format is exactly what the ds-snapshot
// skill writes (see ../../../SCHEMA.md).
//
// A snapshot reaches the browser two ways, and both end up as the same map of
// contract path -> parsed JSON that lib/snapshot-graph.mjs takes:
//
//   - one .bundle.json         the whole snapshot in a single file
//   - a folder, or its files   manifest.json, tokens.json, tokens/<x>.json, …
//
// The example is imported rather than fetched on demand because the production
// build is a single HTML file meant to open from file://, where fetch() of a
// sibling file is blocked. Anything the viewer needs offline has to be bundled.
import example from "../../../snapshot/example.snapshot.json";
import { SnapshotError, filesFromBundle, snapshotGraph } from "../../../lib/snapshot-graph.mjs";

// ../snapshot.json is a private snapshot bundle, not committed (see SCHEMA.md),
// so it may legitimately be absent. `import.meta.glob` resolves to an empty
// object in that case instead of failing the build, which a static import cannot.
const localModules = import.meta.glob("../snapshot.json", { eager: true, import: "default" });
const local = Object.values(localModules)[0];

function build(files, source, isExample) {
  const { graph, warnings } = snapshotGraph(files);
  return { graph, source, isExample, warnings };
}

export const exampleSnapshot = build(filesFromBundle(example), "built-in example", true);

// Null means "nothing loaded yet" — the viewer opens on a prompt to pick a
// snapshot rather than silently showing the example, which reads as real data
// once it's on screen.
export const initialSnapshot = local ? build(filesFromBundle(local) ?? local, "snapshot.json", false) : null;

// Stand-in so the shell can render (and measure) before any snapshot is loaded.
export const emptyGraph = { nodes: [], edges: [], meta: {} };

// Counted from the graph rather than read from the manifest, so the header stays
// honest for a snapshot whose manifest is stale, partial or missing altogether.
export function describeSnapshot(graph) {
  let components = 0;
  let variables = 0;
  let textStyles = 0;
  for (const n of graph.nodes) {
    if (n.kind === "component") components++;
    else if (n.kind === "token" || n.kind === "primitive") variables++;
    else if (n.kind === "textStyle") textStyles++;
  }
  const generatedAt = Date.parse(graph.meta?.snapshot ?? "");
  return {
    components,
    variables,
    textStyles,
    links: graph.edges.length,
    generatedAt: Number.isNaN(generatedAt) ? null : new Date(generatedAt),
  };
}

const readText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new SnapshotError(`Couldn't read ${file.name}.`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(file);
  });

const parse = (text, name) => {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new SnapshotError(`${name} isn't valid JSON. ${e.message}`);
  }
};

// A folder pick reports each file's path within the folder, which is what keeps
// tokens/<collection>.<mode>.json distinct from a stray tokens.json. A plain
// multi-file pick has no paths, so the file's own name is its key.
const keyOf = (file) => {
  const rel = file.webkitRelativePath || file.name;
  const parts = rel.split("/").filter(Boolean);
  // Drop the folder the user picked, keep any subfolder below it.
  return parts.length > 1 ? parts.slice(1).join("/") : parts[0];
};

// `files` is a FileList or array from an <input type="file">: one bundle, or the
// files of a snapshot folder.
export async function readSnapshotFiles(fileList) {
  const picked = [...fileList].filter((f) => f.name.endsWith(".json"));
  if (picked.length === 0) {
    throw new SnapshotError("No .json files in that pick. A snapshot is JSON files.");
  }

  if (picked.length === 1) {
    const doc = parse(await readText(picked[0]), picked[0].name);
    const bundled = filesFromBundle(doc);
    if (bundled) return build(bundled, picked[0].name, false);
    throw new SnapshotError(
      `${picked[0].name} on its own isn't a whole snapshot. Open the .bundle.json, or pick the snapshot folder so every file comes with it.`,
    );
  }

  const files = {};
  for (const file of picked) files[keyOf(file)] = parse(await readText(file), file.name);
  // A folder that happens to hold one bundle and nothing else still works.
  const only = Object.values(files);
  const bundled = only.length === 1 ? filesFromBundle(only[0]) : null;
  const source = picked[0].webkitRelativePath?.split("/")[0] || `${picked.length} files`;
  return build(bundled ?? files, source, false);
}

export { SnapshotError };
