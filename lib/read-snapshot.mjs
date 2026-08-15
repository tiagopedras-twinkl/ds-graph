// Finds a snapshot on disk and reads it into the files map lib/snapshot-graph.mjs
// takes. Node only — the viewer has its own way in, through a file picker.
//
// A snapshot is either a folder or the single-file bundle packed from one. Both
// hold the same files under the same names, so callers never have to care which.
import fs from "node:fs";
import path from "node:path";

import { SNAPSHOT_FILES, SnapshotError, filesFromBundle } from "./snapshot-graph.mjs";

// This repo is the tool and holds no library data. Snapshots live outside it, in
// their own folder when the two sit side by side. Two layouts exist: captures
// directly under `../ds-snapshots`, which is what the skill writes, and captures
// under `../ds-snapshots/snapshots` alongside `archive/` and `inventory/`, which
// is how the folder is sorted once it holds more than captures. Prefer the sorted
// one when it is there. Set DS_SNAPSHOTS_DIR to point somewhere else entirely.
function defaultSnapshotsDir() {
  if (process.env.DS_SNAPSHOTS_DIR) return process.env.DS_SNAPSHOTS_DIR;
  const sorted = "../ds-snapshots/snapshots";
  return fs.existsSync(sorted) ? sorted : "../ds-snapshots";
}

export const SNAPSHOTS_DIR = defaultSnapshotsDir();
export const EXAMPLE = "snapshot/example.snapshot.json";

const dateOf = (name) => (name.match(/\d{4}-\d{2}-\d{2}/) ?? [""])[0];

// A snapshot folder starts with a date and may carry a suffix — `-2` for a second
// capture the same day, or a branch name like `-main`. An earlier version of this
// accepted a bare date only, so every suffixed folder was silently invisible here
// and reachable only through its bundle.
const SNAPSHOT_FOLDER = /^\d{4}-\d{2}-\d{2}(-.+)?$/;

// The newest snapshot in the snapshots folder, folder or bundle. A bundle and a
// folder for the same date are the same snapshot, so the primary sort key is the
// date in the name. Same-date entries fall back to the name, which puts
// `2026-08-15-2` after `2026-08-15` — later capture, later in the sort.
export function newestSnapshot(dir = SNAPSHOTS_DIR) {
  if (!fs.existsSync(dir)) return null;
  const found = fs
    .readdirSync(dir)
    .filter((n) => SNAPSHOT_FOLDER.test(n) || n.endsWith(".bundle.json"))
    .filter((n) => dateOf(n))
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || a.localeCompare(b));
  return found.length ? path.join(dir, found[found.length - 1]) : null;
}

// Every .json in a snapshot folder, keyed by its path relative to the folder.
function readFolder(dir) {
  const files = {};
  const walk = (abs, prefix = "") => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(abs, entry.name), rel);
      else if (entry.name.endsWith(".json")) {
        files[rel] = JSON.parse(fs.readFileSync(path.join(abs, entry.name), "utf8"));
      }
    }
  };
  walk(dir);
  return files;
}

export function readSnapshot(target) {
  if (!fs.existsSync(target)) {
    throw new SnapshotError(
      `${target} does not exist. Point this at a snapshot folder, or at the .bundle.json packed from one.`,
    );
  }
  if (fs.statSync(target).isDirectory()) return readFolder(target);

  const doc = JSON.parse(fs.readFileSync(target, "utf8"));
  const files = filesFromBundle(doc);
  if (!files) {
    throw new SnapshotError(
      `${target} has no "files" in it, so it isn't a snapshot bundle. ` +
        `Point this at a snapshot folder, or at the .bundle.json packed from one.`,
    );
  }
  return files;
}

// What the CLI opens with no argument: the newest real snapshot, else the
// committed example, so a fresh clone still does something.
export function resolveSnapshot(target) {
  if (target) return { target, files: readSnapshot(target), isExample: false };
  const newest = newestSnapshot();
  if (newest) return { target: newest, files: readSnapshot(newest), isExample: false };
  if (fs.existsSync(EXAMPLE)) {
    return { target: EXAMPLE, files: readSnapshot(EXAMPLE), isExample: true };
  }
  throw new SnapshotError(
    `no snapshots in ${SNAPSHOTS_DIR}/ and no ${EXAMPLE}. Capture one with the ds-snapshot skill.`,
  );
}

export { SNAPSHOT_FILES, SnapshotError };
