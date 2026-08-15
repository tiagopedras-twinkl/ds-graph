import { useEffect, useMemo, useRef, useState } from "react";
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
  restoreSnapshot,
} from "./lib/snapshot";
import {
  forgetSnapshot,
  permissionFor,
  pickFiles,
  recallSnapshot,
  rememberSnapshot,
} from "./lib/session";
import "./App.css";

// How long ago a cached copy was taken, in words, so nobody mistakes it for a
// fresh read of the file on disk.
function ago(iso) {
  const then = Date.parse(iso ?? "");
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function App() {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loadError, setLoadError] = useState(null);
  // A snapshot the last session opened that this one cannot read without the
  // user confirming. Null once it is either reopened or dismissed.
  const [pending, setPending] = useState(null);
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
    setPending(null);
  };

  // Reopen whatever the last session had, once, on load.
  //
  // A remembered handle is read again off disk, so a recapture at the same path
  // is picked up. Browsers drop read permission between sessions though, and
  // asking for it back needs a click — so when the answer is "prompt" the viewer
  // offers a button instead of restoring silently. The cached copy is the
  // fallback, and it is labelled as a copy because it cannot see a newer file.
  useEffect(() => {
    if (initialSnapshot) return undefined;
    let cancelled = false;

    (async () => {
      const last = await recallSnapshot();
      if (cancelled || !last) return;

      if (last.handle && (await permissionFor(last.handle)) === "granted") {
        try {
          const file = await last.handle.getFile();
          const next = await readSnapshotFiles([file]);
          if (!cancelled) applySnapshot(next);
          return;
        } catch {
          // Moved, renamed or deleted since. Fall through to the cached copy.
        }
      }
      if (cancelled) return;

      if (last.handle) {
        setPending(last);
        return;
      }
      if (last.files) {
        try {
          const when = ago(last.savedAt);
          applySnapshot(
            restoreSnapshot(last.files, `${last.source} · copy saved ${when ?? "earlier"}`),
          );
        } catch {
          await forgetSnapshot();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Everything that lands a snapshot on screen goes through here, so the session
  // records exactly what the viewer is showing and nothing else.
  const acceptSnapshot = (next, handle) => {
    applySnapshot(next);
    rememberSnapshot({ handle, files: next.files, source: next.source });
  };

  const reopenPending = async () => {
    if (!pending?.handle) return;
    if ((await permissionFor(pending.handle, { request: true })) !== "granted") {
      setLoadError("Permission to read that file was refused. Open it again to continue.");
      return;
    }
    try {
      const file = await pending.handle.getFile();
      acceptSnapshot(await readSnapshotFiles([file]), pending.handle);
    } catch (e) {
      setLoadError(e.message);
      await forgetSnapshot();
      setPending(null);
    }
  };

  const dismissPending = async () => {
    await forgetSnapshot();
    setPending(null);
  };

  // The handle picker is the way in where it exists, because only a handle can be
  // reopened next session. The hidden input stays for every other browser, and
  // for picking the loose files of an unpacked snapshot.
  const openSnapshot = async () => {
    const picked = await pickFiles();
    if (!picked) {
      if (!("showOpenFilePicker" in window)) fileInput.current?.click();
      return;
    }
    try {
      const next = await readSnapshotFiles(picked.files);
      acceptSnapshot(next, picked.handles.length === 1 ? picked.handles[0] : undefined);
    } catch (e) {
      setLoadError(e.message);
    }
  };

  const onPick = async (event) => {
    const picked = [...(event.target.files ?? [])];
    // Clear it first, so picking the same thing twice in a row still fires.
    event.target.value = "";
    if (picked.length === 0) return;
    try {
      acceptSnapshot(await readSnapshotFiles(picked));
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
          <button className="snapshot-button" onClick={openSnapshot}>
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
            {pending ? (
              <>
                <button className="modal-primary" autoFocus onClick={reopenPending}>
                  Reopen {pending.source}
                </button>
                <p className="modal-alt">
                  Last opened {ago(pending.savedAt) ?? "earlier"}. Your browser asks again each
                  session before a page may read a file.{" "}
                  <button className="modal-link" onClick={dismissPending}>
                    Forget it
                  </button>
                  .
                </p>
                <p className="modal-alt">
                  Or{" "}
                  <button className="modal-link" onClick={openSnapshot}>
                    open a different snapshot
                  </button>
                  .
                </p>
              </>
            ) : (
              <button className="modal-primary" autoFocus onClick={openSnapshot}>
                Open snapshot…
              </button>
            )}
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
