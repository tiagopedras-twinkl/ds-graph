// Graph loading and traversal. Ported from ../../query.mjs.
//
// Edge direction convention: `from` depends on / uses `to`. So walking
// outgoing edges from a node gives its dependencies (what it relies on);
// walking incoming edges gives its dependents (what relies on it).
//
// "subcomponent" isn't a real snapshot kind — it's a sidebar-only split of
// "component" for names starting with ".", the Figma convention for a
// component meant to be nested inside others rather than used on its own
// (which is also why Figma itself hides them from the Assets panel).
export const KINDS = ["primitive", "token", "textStyle", "component", "subcomponent"];

export const isSubcomponent = (n) => n.kind === "component" && n.name?.startsWith(".");

// `graphData` is the map read out of a snapshot — either the one bundled
// at build time or one the user loaded at runtime. See lib/snapshot.js.
export function loadGraph(graphData) {
  const nodeById = new Map(graphData.nodes.map((n) => [n.id, n]));
  const outgoing = new Map(); // from -> edges
  const incoming = new Map(); // to -> edges
  for (const e of graphData.edges) {
    if (!outgoing.has(e.from)) outgoing.set(e.from, []);
    outgoing.get(e.from).push(e);
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to).push(e);
  }
  return { nodes: graphData.nodes, edges: graphData.edges, nodeById, outgoing, incoming };
}

// Design token values follow the Design Tokens standard, so a value is one of:
// a reference to another token, written "{some.other.token}"; a colour object; a
// size object with a unit; or a plain number or string.
export function renderValue(value, nodeById) {
  if (typeof value === "string") {
    const ref = value.match(/^\{([^{}]+)\}$/);
    if (!ref) return value;
    const target = nodeById.get(ref[1]);
    return `→ ${target ? target.id : ref[1]}`;
  }
  if (value && typeof value === "object") {
    if (Array.isArray(value.components)) {
      const alpha = value.alpha < 1 ? ` (${Math.round(value.alpha * 100)}%)` : "";
      return `${value.hex ?? rgbHex(value.components)}${alpha}`;
    }
    if (typeof value.value === "number") return `${value.value}${value.unit ?? ""}`;
  }
  return String(value);
}

// Only needed for a colour whose snapshot omitted the optional hex field.
function rgbHex(components) {
  const c = (x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, "0");
  return `#${c(components[0])}${c(components[1])}${c(components[2])}`;
}

// The reference a token's value points at, or null when it holds a plain value.
export function aliasTarget(value) {
  if (typeof value !== "string") return null;
  const ref = value.match(/^\{([^{}]+)\}$/);
  return ref ? ref[1] : null;
}

// BFS in one direction, depth-limited. `edgeMap` is either `incoming`
// (walk = dependents) or `outgoing` (walk = dependencies). `neighborId(e)`
// picks the node id on the far side of the edge for that direction.
function walk(startId, edgeMap, neighborId, maxDepth) {
  const depthOf = new Map([[startId, 0]]);
  const viaEdge = new Map();
  const queue = [[startId, 0]];
  while (queue.length) {
    const [id, depth] = queue.shift();
    if (depth >= maxDepth) continue;
    for (const e of edgeMap.get(id) || []) {
      const nid = neighborId(e);
      if (depthOf.has(nid)) continue;
      depthOf.set(nid, depth + 1);
      viaEdge.set(nid, e);
      queue.push([nid, depth + 1]);
    }
  }
  depthOf.delete(startId);
  return { depthOf, viaEdge };
}

// What depends on this node — reverse walk through incoming edges.
export function dependents(graph, startId, maxDepth = Infinity) {
  return walk(startId, graph.incoming, (e) => e.from, maxDepth);
}

// What this node depends on — forward walk through outgoing edges.
export function dependencies(graph, startId, maxDepth = Infinity) {
  return walk(startId, graph.outgoing, (e) => e.to, maxDepth);
}

// Full (unlimited depth) impact summary for the right-hand pane —
// mirrors query.mjs's plain-text CLI output.
export function impactSummary(graph, startId) {
  const { depthOf, viaEdge } = dependents(graph, startId, Infinity);
  const comps = [];
  const toks = [];
  for (const [id, depth] of depthOf) {
    const n = graph.nodeById.get(id);
    if (!n) continue;
    if (n.kind === "component") comps.push({ id, depth, node: n, via: viaEdge.get(id) });
    else if (n.kind === "token") toks.push({ id, depth, node: n, via: viaEdge.get(id) });
  }
  comps.sort((a, b) => a.depth - b.depth);
  toks.sort((a, b) => a.depth - b.depth);
  return { components: comps, tokens: toks };
}

export function searchNodes(graph, query, kindFilter) {
  const q = query.trim().toLowerCase();
  return graph.nodes
    .filter((n) => {
      if (kindFilter === "subcomponent") {
        if (!isSubcomponent(n)) return false;
      } else if (kindFilter === "component") {
        if (n.kind !== "component" || isSubcomponent(n)) return false;
      } else if (kindFilter && n.kind !== kindFilter) {
        return false;
      }
      if (!q) return true;
      return n.id.toLowerCase().includes(q) || n.name?.toLowerCase().includes(q);
    })
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
}
