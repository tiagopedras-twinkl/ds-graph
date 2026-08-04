import { useMemo } from "react";
import { dependencies, dependents, impactSummary, renderValue } from "../lib/graph";
import VariantExplorer from "./VariantExplorer";

const KIND_LABEL = {
  component: "Component",
  token: "Token",
  primitive: "Primitive",
  textStyle: "Text style",
};

// How a previewed node relates to whatever's still centred on the map,
// phrased the same way BINDS/NESTS/ALIASES relationships already read
// elsewhere in this panel ("via fills", "nested inside", …), so a preview
// reads as a continuation of the map rather than a fresh, disconnected node.
function describeRelation(graph, previewId, focusedId) {
  const hub = graph.nodeById.get(focusedId);
  if (!hub) return null;
  const hubName = hub.name || hub.id;

  const direct = (graph.outgoing.get(focusedId) || []).find((e) => e.to === previewId);
  if (direct) return { hubName, toward: "dependency", edge: direct };
  const directBack = (graph.incoming.get(focusedId) || []).find((e) => e.from === previewId);
  if (directBack) return { hubName, toward: "dependent", edge: directBack };

  if (dependencies(graph, focusedId).depthOf.has(previewId)) {
    return { hubName, toward: "dependency", edge: null };
  }
  if (dependents(graph, focusedId).depthOf.has(previewId)) {
    return { hubName, toward: "dependent", edge: null };
  }
  return null;
}

function relationLabel({ hubName, toward, edge }) {
  if (edge?.type === "NESTS") {
    return toward === "dependent" ? `Parent of ${hubName}` : `Nested inside ${hubName}`;
  }
  if (edge?.type === "BINDS") {
    const props = edge.props?.length ? ` via ${[...new Set(edge.props)].slice(0, 2).join(", ")}` : "";
    return toward === "dependent" ? `Uses ${hubName}${props}` : `Used by ${hubName}${props}`;
  }
  if (edge?.type === "ALIASES") {
    return toward === "dependent" ? `Points to ${hubName}` : `Referenced by ${hubName}`;
  }
  if (edge?.type === "USES_TEXT_STYLE") {
    return toward === "dependent" ? `Uses ${hubName}` : `Used by ${hubName}`;
  }
  return toward === "dependent" ? `Depends on ${hubName}` : `Used by ${hubName}`;
}

export default function ImpactPanel({ graph, focusedId, previewId, onFocus }) {
  // A preview (clicked but not yet committed) takes over the panel; once
  // dismissed or focused, it falls back to whatever's actually on the map.
  const showId = previewId || focusedId;
  const isPreview = !!previewId && previewId !== focusedId;
  const node = showId ? graph.nodeById.get(showId) : null;
  const summary = useMemo(() => (showId ? impactSummary(graph, showId) : null), [graph, showId]);
  const relation = useMemo(
    () => (isPreview && focusedId ? describeRelation(graph, showId, focusedId) : null),
    [graph, showId, focusedId, isPreview],
  );

  if (!showId || !node) {
    return (
      <div className="impact-panel">
        <div className="impact-empty">Pick something on the left to see more about it.</div>
      </div>
    );
  }

  const { components, tokens } = summary;

  return (
    <div className="impact-panel">
      <div className="impact-header">
        <span className={`dot dot-${node.kind}`} />
        <div>
          <div className="impact-title">{node.name || node.id}</div>
          <div className="impact-subtitle">
            {KIND_LABEL[node.kind] || node.kind}
            {node.collection ? ` · ${node.collection}` : ""}
            {node.unresolved ? " · unresolved reference" : ""}
            {node.external ? " · outside this file" : ""}
          </div>
          {relation && <div className="impact-relation">{relationLabel(relation)}</div>}
        </div>
      </div>

      {isPreview && (
        <button className="focus-button" onClick={() => onFocus(showId)}>
          Focus in map →
        </button>
      )}

      {node.figmaUrl && (
        <a className="impact-figma-link" href={node.figmaUrl} target="_blank" rel="noreferrer">
          Open in Figma ↗
        </a>
      )}

      {node.variants && Object.keys(node.variants).length > 0 && <VariantExplorer node={node} />}

      {/* One row per theme. A single-mode collection shows one row; the token
          collection has five, and the value often differs in each. */}
      {node.modes && Object.keys(node.modes).length > 0 && (
        <div className="impact-modes">
          {Object.entries(node.modes).map(([mode, value]) => (
            <div className="impact-mode-row" key={mode}>
              <span className="impact-mode-name">{mode}</span>
              <span className="impact-mode-value">{renderValue(value, graph.nodeById)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="impact-summary-line">
        {components.length === 0 && tokens.length === 0 ? (
          <>Nothing else uses this — changing it is safe on its own.</>
        ) : (
          <>
            Changing this touches <strong>{components.length}</strong>{" "}
            {components.length === 1 ? "component" : "components"}
            {tokens.length > 0 && (
              <>
                {" "}
                through <strong>{tokens.length}</strong> other {tokens.length === 1 ? "token" : "tokens"}
              </>
            )}
            .
          </>
        )}
      </div>

      {tokens.length > 0 && (
        <div className="impact-section">
          <h4>Tokens that follow it</h4>
          <ul className="impact-list">
            {tokens.map((t) => (
              <li key={t.id}>
                <span className="impact-item-name">{t.node.name || t.id}</span>
                {t.via?.mode && <span className="impact-item-tag">{t.via.mode}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {components.length > 0 && (
        <div className="impact-section">
          <h4>Components affected</h4>
          <ul className="impact-list">
            {components.map((c) => (
              <li key={c.id}>
                <span className="impact-item-name">{c.node.name}</span>
                {c.node.variantCount > 1 && (
                  <span className="impact-item-tag">{c.node.variantCount} variants</span>
                )}
                {c.via?.props?.length > 0 && (
                  <span className="impact-item-props">
                    via {[...new Set(c.via.props)].slice(0, 3).join(", ")}
                  </span>
                )}
                {c.via?.type === "NESTS" && <span className="impact-item-props">nested inside</span>}
                {c.via?.type === "USES_TEXT_STYLE" && (
                  <span className="impact-item-props">uses this text style</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
