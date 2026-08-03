import { useEffect, useMemo, useState } from "react";

// Lets a designer construct one specific variant (e.g. Size=Large,
// State=Hover) and see its full combination. Bindings aren't captured per
// variant in the snapshot — build.mjs records the axes but attaches BINDS
// edges to the whole component (see HANDOFF.md's "deliberately deferred"
// note) — so picking a combination here doesn't affect what the map shows.
export default function VariantExplorer({ node }) {
  const dims = useMemo(() => Object.entries(node.variants), [node]);
  const [selection, setSelection] = useState(() =>
    Object.fromEntries(dims.map(([key, values]) => [key, values[0]])),
  );

  useEffect(() => {
    setSelection(Object.fromEntries(dims.map(([key, values]) => [key, values[0]])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  return (
    <div className="variant-explorer">
      <h4>
        <span>Variants</span>
        <span className="variant-count">{node.variantCount} combinations</span>
      </h4>
      <div className="variant-dims">
        {dims.map(([key, values]) => (
          <label className="variant-dim" key={key}>
            <span className="variant-dim-name">{key}</span>
            <select
              value={selection[key]}
              onChange={(e) => setSelection((prev) => ({ ...prev, [key]: e.target.value }))}
            >
              {values.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="variant-note">
        Bindings aren't captured per variant yet, so this combination is for reference — it
        doesn't change what the map shows.
      </p>
    </div>
  );
}
