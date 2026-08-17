// The ds-snapshot vocabulary that sits on top of the generic graph-engine
// package (https://github.com/tiagopedras/graph-engine, private): what a
// "component", "token" or "subcomponent" is, what a design token value looks
// like, and the BINDS/ALIASES/NESTS/USES_TEXT_STYLE edge types mean. None of
// that lives in graph-engine itself — it only ever reads a node's `kind` or
// an edge's `type` as an opaque string.
import { dependents as engineDependents, dependencies as engineDependencies } from "graph-engine";

export { loadGraph } from "graph-engine";
export const dependents = engineDependents;
export const dependencies = engineDependencies;

// "subcomponent" isn't a real snapshot kind — it's a sidebar-only split of
// "component" for names starting with ".", the Figma convention for a
// component meant to be nested inside others rather than used on its own
// (which is also why Figma itself hides them from the Assets panel).
export const KINDS = ["primitive", "token", "textStyle", "component", "subcomponent"];

export const isSubcomponent = (n) => n.kind === "component" && n.name?.startsWith(".");

// Colours GraphView draws each kind's nodes in — GraphView itself only knows
// "kind" is some string on a node; this is where that string gets meaning.
export const KIND_COLOR = {
  component: "#2563eb",
  token: "#059669",
  primitive: "#d97706",
  textStyle: "#7c3aed",
};

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
