// Impact query: "if I change X, what else moves?"
// Walks the graph backwards from a node to everything that depends on it.
//
//   node query.mjs "blue-500"          what breaks if this changes
//   node query.mjs --orphans           defined but nothing uses them
//   node query.mjs --strays            components reaching past tokens to raw values
//   node query.mjs --dupes             same name living in two collections
//
// Reads a ds-snapshot directly — the newest in ds-snapshots/ unless one is named
// with --snapshot <path>. Same snapshot the viewer opens, same interpretation of
// it (lib/snapshot-graph.mjs), so the two can never disagree.
import { resolveSnapshot, SnapshotError } from "./lib/read-snapshot.mjs";
import { snapshotGraph } from "./lib/snapshot-graph.mjs";

const args = process.argv.slice(2);
const at = args.indexOf("--snapshot");
const target = at === -1 ? undefined : args.splice(at, 2)[1];

let source;
let graph;
try {
  source = resolveSnapshot(target);
  const built = snapshotGraph(source.files);
  graph = built.graph;
  if (source.isExample) console.log(`no snapshot in ds-snapshots/ — using ${source.target}\n`);
  for (const w of built.warnings) console.log(`note: ${w}\n`);
} catch (e) {
  console.error(e instanceof SnapshotError ? e.message : e);
  process.exit(1);
}
const nodes = new Map(graph.nodes.map((n) => [n.id, n]));

const incoming = new Map();
for (const e of graph.edges) {
  if (!incoming.has(e.to)) incoming.set(e.to, []);
  incoming.get(e.to).push(e);
}

// Design token values follow the Design Tokens standard: a reference to another
// token written "{some.other.token}", a colour object, a size object with a unit,
// or a plain number or string.
function renderValue(v) {
  if (typeof v === "string") {
    const ref = v.match(/^\{([^{}]+)\}$/);
    if (!ref) return v;
    const t = nodes.get(ref[1]);
    return `→ ${t ? t.id : ref[1]}`;
  }
  if (v && typeof v === "object") {
    if (Array.isArray(v.components)) {
      const alpha = v.alpha < 1 ? ` (${Math.round(v.alpha * 100)}%)` : "";
      return `${v.hex ?? "#?"}${alpha}`;
    }
    if (typeof v.value === "number") return `${v.value}${v.unit ?? ""}`;
  }
  return String(v);
}

function dependents(startId) {
  const seen = new Map([[startId, 0]]);
  const queue = [[startId, 0]];
  const via = new Map();
  while (queue.length) {
    const [id, depth] = queue.shift();
    for (const e of incoming.get(id) || []) {
      if (seen.has(e.from)) continue;
      seen.set(e.from, depth + 1);
      via.set(e.from, e);
      queue.push([e.from, depth + 1]);
    }
  }
  seen.delete(startId);
  return { seen, via };
}

const arg = args[0];

if (arg === "--orphans") {
  const used = new Set(graph.edges.map((e) => e.to));
  const unused = graph.nodes.filter(
    (n) => (n.kind === "token" || n.kind === "textStyle") && !used.has(n.id),
  );
  console.log(`${unused.length} tokens/styles with nothing pointing at them:\n`);
  for (const n of unused) console.log("  " + n.id);
} else if (arg === "--strays") {
  const direct = graph.edges.filter(
    (e) => e.type === "BINDS" && nodes.get(e.to)?.kind === "primitive",
  );
  const byComponent = {};
  for (const e of direct) (byComponent[e.from] ||= []).push(e.to);
  console.log(
    `${direct.length} bindings skip the token layer and hit a raw value directly,` +
      ` across ${Object.keys(byComponent).length} components:\n`,
  );
  for (const [c, list] of Object.entries(byComponent).sort(
    (a, b) => b[1].length - a[1].length,
  ))
    console.log(`  ${c.replace("Component/", "")} → ${[...new Set(list)].join(", ")}`);
} else if (arg === "--dupes") {
  // Compare the leaf name only. "Rounding/rounded-xl" inside the Tokens
  // collection and "rounded-xl" in a collection of its own are the same
  // token to a designer, even though their full paths differ.
  const byShortName = {};
  for (const n of graph.nodes) {
    if (n.kind !== "token" && n.kind !== "primitive") continue;
    const short = n.name.split("/").pop();
    (byShortName[short] ||= []).push(n.id);
  }
  const dupes = Object.entries(byShortName).filter(([, ids]) => ids.length > 1);
  console.log(`${dupes.length} names defined in more than one collection:\n`);
  for (const [name, ids] of dupes) console.log(`  ${name}\n    ${ids.join("\n    ")}`);
} else if (arg) {
  const matches = graph.nodes.filter((n) =>
    n.id.toLowerCase().includes(arg.toLowerCase()),
  );
  if (!matches.length) {
    console.log(`Nothing matching "${arg}".`);
    process.exit(1);
  }
  if (matches.length > 1 && !matches.some((m) => m.id === arg)) {
    console.log(`${matches.length} matches — narrow it down:\n`);
    for (const m of matches.slice(0, 25)) console.log("  " + m.id);
    process.exit(0);
  }
  const target = matches.find((m) => m.id === arg) || matches[0];
  const { seen, via } = dependents(target.id);

  const comps = [...seen].filter(([id]) => nodes.get(id)?.kind === "component");
  const toks = [...seen].filter(([id]) => nodes.get(id)?.kind === "token");

  console.log(`\n  ${target.id}`);
  console.log(`  ${target.kind}${target.collection ? " · " + target.collection : ""}`);
  if (target.modes) {
    for (const [m, v] of Object.entries(target.modes).slice(0, 6))
      console.log(`    ${m}: ${renderValue(v)}`);
  }
  console.log(
    `\n  Changing this touches ${toks.length} tokens and ${comps.length} components.\n`,
  );

  if (toks.length) {
    console.log("  Tokens that follow it:");
    for (const [id] of toks.slice(0, 20)) {
      const e = via.get(id);
      console.log(`    ${id}${e?.mode ? `  (${e.mode})` : ""}`);
    }
    if (toks.length > 20) console.log(`    …and ${toks.length - 20} more`);
    console.log("");
  }
  if (comps.length) {
    console.log("  Components affected:");
    for (const [id, depth] of comps.sort((a, b) => a[1] - b[1]).slice(0, 30)) {
      const n = nodes.get(id);
      const e = via.get(id);
      const how = e?.props ? ` [${[...new Set(e.props)].slice(0, 3).join(", ")}]` : "";
      console.log(
        `    ${n.name}${n.variantCount > 1 ? ` (${n.variantCount} variants)` : ""}${how}`,
      );
    }
    if (comps.length > 30) console.log(`    …and ${comps.length - 30} more`);
  }
  console.log("");
} else {
  console.log(
    "usage: node query.mjs <token-or-component>  |  --orphans  |  --strays  |  --dupes\n" +
      "       add --snapshot <folder-or-bundle> to read a snapshot other than the newest",
  );
  console.log(`\nreading: ${source.target}`);
}
