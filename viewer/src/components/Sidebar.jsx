import { useMemo, useState } from "react";
import { KINDS, isSubcomponent, searchNodes } from "../lib/graph";

const KIND_LABEL = {
  component: "Components",
  subcomponent: "Subcomponents",
  token: "Tokens",
  primitive: "Primitives",
  textStyle: "Typography Styles",
};

export default function Sidebar({ graph, focusedId, previewId, onFocus }) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("component");

  const results = useMemo(
    () => searchNodes(graph, query, kindFilter),
    [graph, query, kindFilter],
  );

  const counts = useMemo(() => {
    const c = {};
    for (const n of graph.nodes) {
      const key = isSubcomponent(n) ? "subcomponent" : n.kind;
      c[key] = (c[key] || 0) + 1;
    }
    return c;
  }, [graph]);

  return (
    <div className="sidebar">
      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Search components, tokens…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      <div className="kind-filters">
        {KINDS.map((k) => (
          <button
            key={k}
            className={kindFilter === k ? "kind-chip active" : "kind-chip"}
            onClick={() => setKindFilter(k)}
          >
            <span className={`dot dot-${k}`} />
            {KIND_LABEL[k]} ({counts[k] || 0})
          </button>
        ))}
        <button className="kind-chip disabled" disabled title="Coming soon">
          <span className="dot dot-module" />
          Modules - WIP
        </button>
      </div>
      <div className="node-list">
        {results.length === 0 && <div className="empty">Nothing matches.</div>}
        {results.slice(0, 300).map((n) => (
          <button
            key={n.id}
            className={
              n.id === focusedId
                ? "node-row selected"
                : n.id === previewId
                  ? "node-row previewing"
                  : "node-row"
            }
            onClick={() => onFocus(n.id)}
            title={n.id}
          >
            <span className={`dot dot-${n.kind}`} />
            <span className="node-row-name">{n.name || n.id}</span>
            {n.variantCount > 1 && <span className="node-row-meta">{n.variantCount}v</span>}
          </button>
        ))}
        {results.length > 300 && (
          <div className="empty">…and {results.length - 300} more. Narrow your search.</div>
        )}
      </div>
    </div>
  );
}
