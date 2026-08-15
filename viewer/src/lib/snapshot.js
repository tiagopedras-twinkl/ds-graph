// Where the graph on screen comes from: a ds-snapshot the user opens, or a
// built-in one at startup. The viewer reads snapshots and nothing else — there is
// no intermediate file to go stale, and the format is exactly what the ds-snapshot
// skill writes and validates (see its references/output-contract.md).
//
// The way in is the single .bundle.json, which holds the whole snapshot. A set of
// loose snapshot files picked together assembles too, since it is the same map of
// contract path -> parsed JSON that lib/snapshot-graph.mjs takes — but a file
// picker cannot reach into tokens/, so the bundle is what the viewer asks for.
//
// The example is imported rather than fetched on demand because the production
// build is a single HTML file meant to open from file://, where fetch() of a
// sibling file is blocked. Anything the viewer needs offline has to be bundled.
import example from "../../../snapshot/example.snapshot.json";
import { SnapshotError, filesFromBundle, snapshotGraph } from "../../../lib/snapshot-graph.mjs";

// The snapshot to open with, read from outside this repo at build time — see
// vite.config.js for where it looks. Null when there is none, which is normal:
// this repo is the tool and holds no library data of its own.
import local from "virtual:local-snapshot";

// `files` rides along on the result so the session can cache exactly what was
// read, without the caller having to keep a second copy of it.
function build(files, source, isExample) {
  const { graph, warnings } = snapshotGraph(files);
  return { graph, source, isExample, warnings, files };
}

// Rebuild from a files map the session cached earlier. Same path as a fresh read,
// so a snapshot that has since become unreadable fails here rather than on screen.
export function restoreSnapshot(files, source) {
  return build(files, source, false);
}

export const exampleSnapshot = build(filesFromBundle(example), "built-in example", true);

// Null means "nothing loaded yet" — the viewer opens on a prompt to pick a
// snapshot rather than silently showing the example, which reads as real data
// once it's on screen.
//
// __SNAPSHOT_PATH__ is the file's absolute location on the machine that built
// the app, injected by vite.config.js — real and known because build time has
// filesystem access. Not the same guarantee applies once a snapshot is opened
// through the file picker below: browsers deliberately hide a picked file's
// folder from the page, so `source` there can only ever be a name.
export const initialSnapshot = local
  ? build(
      filesFromBundle(local) ?? local,
      (typeof __SNAPSHOT_PATH__ !== "undefined" && __SNAPSHOT_PATH__) || "snapshot.json",
      false,
    )
  : null;

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

// A pick that carries a path within a folder keeps tokens/<collection>.<mode>.json
// distinct from a stray tokens.json. A plain multi-file pick has no paths, so the
// file's own name is its key.
const keyOf = (file) => {
  const rel = file.webkitRelativePath || file.name;
  const parts = rel.split("/").filter(Boolean);
  // Drop the enclosing folder, keep any subfolder below it.
  return parts.length > 1 ? parts.slice(1).join("/") : parts[0];
};

// `files` is a FileList or array from an <input type="file">: one bundle, or the
// loose files of a snapshot.
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
      `${picked[0].name} on its own isn't a whole snapshot. Open the .bundle.json — one file with everything in it.`,
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
