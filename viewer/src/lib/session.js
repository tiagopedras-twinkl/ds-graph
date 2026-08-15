// Remembers the last snapshot the viewer opened, so the next visit comes back to
// it instead of an empty picker.
//
// Two ways to remember, because browsers do not agree on what a page may hold.
//
//   handle  — a FileSystemFileHandle from showOpenFilePicker. This is the real
//             thing: reopening reads the file again off disk, so a recapture at
//             the same path shows up. Chrome and Edge only, and reading it again
//             in a later session needs the user to confirm once.
//   content — the parsed snapshot itself. Works everywhere IndexedDB works, and
//             restores with no prompt, but it is a copy. It cannot notice that
//             the file on disk changed, so the viewer says when it was cached.
//
// Neither works from file://, where the origin is opaque and storage is refused.
// Every function here fails soft: no session simply means the picker opens, which
// is exactly how the viewer behaved before this existed.

const DB_NAME = "ds-graph";
const STORE = "session";
const KEY = "last";

let dbPromise;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch {
      // file:// and private modes throw here rather than firing onerror.
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function run(mode, work) {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        let tx;
        try {
          tx = db.transaction(STORE, mode);
        } catch {
          resolve(null);
          return;
        }
        const request = work(tx.objectStore(STORE));
        tx.onabort = () => resolve(null);
        tx.onerror = () => resolve(null);
        if (!request) {
          tx.oncomplete = () => resolve(true);
          return;
        }
        request.onsuccess = () => resolve(request.result ?? true);
        request.onerror = () => resolve(null);
      }),
  );
}

// True when this browser can hand back a file it opened in an earlier session.
export const canRememberFiles = typeof window !== "undefined" && "showOpenFilePicker" in window;

// `handle` is preferred and `files` is the fallback copy. Pass both when you have
// both: a handle that later loses permission still leaves something to restore.
export function rememberSnapshot({ handle, files, source }) {
  const record = { source, savedAt: new Date().toISOString() };
  if (handle) record.handle = handle;
  // A structured clone of the parsed snapshot. Around 1-2 MB for a real library,
  // which IndexedDB takes without complaint.
  if (files) record.files = files;
  return run("readwrite", (store) => store.put(record, KEY)).catch(() => null);
}

export function recallSnapshot() {
  return run("readonly", (store) => store.get(KEY))
    .then((record) => (record && typeof record === "object" ? record : null))
    .catch(() => null);
}

export function forgetSnapshot() {
  return run("readwrite", (store) => store.delete(KEY)).catch(() => null);
}

// 'granted', 'prompt' or 'denied'. Asking has to come from a click, so the caller
// queries on load and only requests when the user presses the reopen button.
export async function permissionFor(handle, { request = false } = {}) {
  if (!handle?.queryPermission) return "denied";
  try {
    const current = await handle.queryPermission({ mode: "read" });
    if (current === "granted" || !request) return current;
    return await handle.requestPermission({ mode: "read" });
  } catch {
    return "denied";
  }
}

// Opens the picker that yields handles. Returns null when the browser has no such
// picker, so the caller can fall back to a plain file input, and null when the
// person cancels.
export async function pickFiles({ multiple = true } = {}) {
  if (!canRememberFiles) return null;
  try {
    const handles = await window.showOpenFilePicker({
      multiple,
      types: [{ description: "Snapshot", accept: { "application/json": [".json"] } }],
    });
    const files = await Promise.all(handles.map((h) => h.getFile()));
    return { handles, files };
  } catch {
    // AbortError when cancelled, SecurityError without a user gesture. Neither is
    // worth an error message.
    return null;
  }
}
