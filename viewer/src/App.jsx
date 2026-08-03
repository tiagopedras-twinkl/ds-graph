import { useMemo, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import GraphView from "./components/GraphView";
import ImpactPanel from "./components/ImpactPanel";
import { loadGraph } from "./lib/graph";
import {
  describeSnapshot,
  exampleSnapshot,
  initialSnapshot,
  readSnapshotFile,
} from "./lib/snapshot";
import "./App.css";

function App() {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loadError, setLoadError] = useState(null);
  const fileInput = useRef(null);
  const graph = useMemo(() => loadGraph(snapshot.graph), [snapshot]);
  const summary = useMemo(() => describeSnapshot(snapshot.graph), [snapshot]);
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

  const onPickFile = async (event) => {
    const file = event.target.files?.[0];
    // Clear it first, so picking the same file twice in a row still fires.
    event.target.value = "";
    if (!file) return;
    try {
      applySnapshot(await readSnapshotFile(file));
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
          <span className="app-header-meta">
            {summary.components} components · {summary.variables} variables ·{" "}
            {summary.links.toLocaleString()} links
            {summary.generatedAt ? ` · ${summary.generatedAt.toLocaleDateString()}` : ""}
          </span>
          <span
            className={`snapshot-source${snapshot.isExample ? " is-example" : ""}`}
            title={snapshot.isExample ? "Synthetic sample data, not a real library" : snapshot.source}
          >
            {snapshot.isExample ? "example data" : snapshot.source}
          </span>
          {!snapshot.isExample && (
            <button className="snapshot-button" onClick={() => applySnapshot(exampleSnapshot)}>
              Use example
            </button>
          )}
          <button className="snapshot-button" onClick={() => fileInput.current?.click()}>
            Load snapshot…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            onChange={onPickFile}
            hidden
          />
        </div>
      </header>
      {loadError && (
        <div className="app-notice is-error" role="alert">
          <span>{loadError}</span>
          <button onClick={() => setLoadError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {!loadError && snapshot.warnings?.length > 0 && (
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
    </div>
  );
}

export default App;
