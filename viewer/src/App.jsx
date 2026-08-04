import { useMemo, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import GraphView from "./components/GraphView";
import ImpactPanel from "./components/ImpactPanel";
import { loadGraph } from "./lib/graph";
import {
  describeSnapshot,
  emptyGraph,
  exampleSnapshot,
  initialSnapshot,
  readSnapshotFiles,
} from "./lib/snapshot";
import "./App.css";

function App() {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loadError, setLoadError] = useState(null);
  const fileInput = useRef(null);
  const graph = useMemo(() => loadGraph(snapshot?.graph ?? emptyGraph), [snapshot]);
  const summary = useMemo(() => describeSnapshot(snapshot?.graph ?? emptyGraph), [snapshot]);
  // `nav` is the back/forward history of focused (map-centred) nodes.
  // `previewId` is a lighter-weight "more about this" peek that doesn't
  // touch history or recentre the map until the user explicitly focuses it.
  const [nav, setNav] = useState({ history: [], index: -1 });
  const [previewId, setPreviewId] = useState(null);
  const focusedId = nav.index >= 0 ? nav.history[nav.index] : null;

  const focusNode = (id) => {
    setNav(({ history, index }) => {
      if (history[index] === id) return { history, index };
      const truncated = history.slice(0, index + 1);
      truncated.push(id);
      return { history: truncated, index: truncated.length - 1 };
    });
    setPreviewId(null);
  };
  const goBack = () => {
    setNav(({ history, index }) => (index > 0 ? { history, index: index - 1 } : { history, index }));
    setPreviewId(null);
  };
  const goForward = () => {
    setNav(({ history, index }) =>
      index < history.length - 1 ? { history, index: index + 1 } : { history, index },
    );
    setPreviewId(null);
  };

  // Swapping the graph invalidates every node id in the history, so navigation
  // resets rather than carrying stale selections into the new snapshot.
  const applySnapshot = (next) => {
    setSnapshot(next);
    setNav({ history: [], index: -1 });
    setPreviewId(null);
    setLoadError(null);
  };

  const onPick = async (event) => {
    const picked = [...(event.target.files ?? [])];
    // Clear it first, so picking the same thing twice in a row still fires.
    event.target.value = "";
    if (picked.length === 0) return;
    try {
      applySnapshot(await readSnapshotFiles(picked));
    } catch (e) {
      setLoadError(e.message);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <strong>ds-graph</strong>
          <span className="app-header-sub">design system dependency map</span>
        </div>
        <div className="app-header-right">
          {snapshot && (
            <>
              <span className="app-header-meta">
                {summary.components} components · {summary.variables} variables ·{" "}
                {summary.links.toLocaleString()} links
                {summary.generatedAt ? ` · ${summary.generatedAt.toLocaleDateString()}` : ""}
              </span>
              <span
                className={`snapshot-source${snapshot.isExample ? " is-example" : ""}`}
                title={
                  snapshot.isExample ? "Synthetic sample data, not a real library" : snapshot.source
                }
              >
                {snapshot.isExample ? "example data" : snapshot.source}
              </span>
              {!snapshot.isExample && (
                <button className="snapshot-button" onClick={() => applySnapshot(exampleSnapshot)}>
                  Use example
                </button>
              )}
            </>
          )}
          <button className="snapshot-button" onClick={() => fileInput.current?.click()}>
            Load snapshot…
          </button>
          {/* `multiple` so an unpacked snapshot still loads if its files are
              picked together, even though the bundle is the way in. */}
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            multiple
            onChange={onPick}
            hidden
          />
        </div>
      </header>
      {snapshot && loadError && (
        <div className="app-notice is-error" role="alert">
          <span>{loadError}</span>
          <button onClick={() => setLoadError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {snapshot && !loadError && snapshot.warnings?.length > 0 && (
        <div className="app-notice">
          <span>{snapshot.warnings.join(" ")}</span>
        </div>
      )}
      <div className="app-body">
        <Sidebar graph={graph} focusedId={focusedId} previewId={previewId} onFocus={focusNode} />
        <div className="center-column">
          <GraphView
            graph={graph}
            focusedId={focusedId}
            onPreview={setPreviewId}
            canGoBack={nav.index > 0}
            canGoForward={nav.index < nav.history.length - 1}
            onBack={goBack}
            onForward={goForward}
          />
        </div>
        <ImpactPanel graph={graph} focusedId={focusedId} previewId={previewId} onFocus={focusNode} />
      </div>
      {/* Nothing loaded yet: the shell behind stays empty and the only way
          forward is picking a file or opting into the example on purpose. */}
      {!snapshot && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="start-modal-title">
            <h2 id="start-modal-title">Open a snapshot</h2>
            <p className="modal-body">
              A snapshot is a dated capture of your Figma library — one{" "}
              <code>.bundle.json</code> file. Nothing is uploaded; it's read here in the browser.
            </p>
            {loadError && (
              <p className="modal-error" role="alert">
                {loadError}
              </p>
            )}
            <button className="modal-primary" autoFocus onClick={() => fileInput.current?.click()}>
              Open snapshot…
            </button>
            <p className="modal-alt">
              Or{" "}
              <button className="modal-link" onClick={() => applySnapshot(exampleSnapshot)}>
                explore example data
              </button>{" "}
              — made-up components and tokens, not a real library.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
