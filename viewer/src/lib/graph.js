// Graph loading and traversal. Ported from ../../query.mjs.
//
// Edge direction convention: `from` depends on / uses `to`. So walking
// outgoing edges from a node gives its dependencies (what it relies on);
// walking incoming edges gives its dependents (what relies on it).
export const KINDS = ["primitive", "token", "textStyle", "component"];

// `graphData` is the parsed contents of a graph.json — either the one bundled
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

// A mode value is one of three shapes, all objects to `typeof`: check
// `.alias` first, then `.r` for a colour, else it's a plain number.
export function renderValue(value, nodeById) {
  if (value && typeof value === "object" && value.alias) {
    const t = nodeById.get(value.alias);
    return `→ ${t ? t.id : value.alias}`;
  }
  if (value && typeof value === "object" && typeof value.r === "number") {
    const hex = (c) => Math.round(c * 255).toString(16).padStart(2, "0");
    const alpha = value.a < 1 ? ` (${Math.round(value.a * 100)}%)` : "";
    return `#${hex(value.r)}${hex(value.g)}${hex(value.b)}${alpha}`;
  }
  return String(value);
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
      if (kindFilter && n.kind !== kindFilter) return false;
      if (!q) return true;
      return n.id.toLowerCase().includes(q) || n.name?.toLowerCase().includes(q);
    })
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
}
