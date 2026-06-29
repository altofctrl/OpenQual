// io/fileSync.js
// Live "autosave to a local file" via the File System Access API. The user picks a
// .json once; from then on every autosave also writes the project to that file on disk.
// The chosen FileSystemFileHandle is stashed in IndexedDB so it survives reloads — the
// browser then only needs a one-click permission re-grant (a user gesture) to keep
// writing. Unsupported browsers (Firefox/Safari) fall back to the localStorage autosave
// that store.js already does; this module's calls just no-op there.

export const fsSupported =
  typeof window !== "undefined" &&
  "showSaveFilePicker" in window &&
  "showOpenFilePicker" in window;

const DB_NAME = "openqual";
const STORE = "handles";
const KEY = "projectFile";

let handle = null; // the live FileSystemFileHandle, once linked

// --- tiny IndexedDB key/value (handles can't go in localStorage) ----------------
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbSet(key, val) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, "readwrite").objectStore(STORE).put(val, key);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}
async function idbDel(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, "readwrite").objectStore(STORE).delete(key);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

// --- public API -----------------------------------------------------------------

export function linkedName() {
  return handle ? handle.name : null;
}

// Reconnect a handle persisted from a previous session. Returns the file name, or null.
// Does not prompt for permission — that needs a user gesture (see ensureWritable).
export async function restoreHandle() {
  if (!fsSupported) return null;
  try {
    const h = await idbGet(KEY);
    if (h) { handle = h; return h.name; }
  } catch (_) { /* ignore */ }
  return null;
}

// "granted" without prompting, or "granted" after a prompt when withPrompt is true.
export async function ensureWritable(withPrompt = false) {
  if (!handle) return false;
  const opts = { mode: "readwrite" };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  if (withPrompt && (await handle.requestPermission(opts)) === "granted") return true;
  return false;
}

// Ask the user for a new file to save into, then remember the handle.
export async function pickSaveFile(suggestedName) {
  handle = await window.showSaveFilePicker({
    suggestedName,
    types: [{ description: "OpenQual project", accept: { "application/json": [".json"] } }],
  });
  await idbSet(KEY, handle);
  return handle.name;
}

// Open an existing project file for editing-in-place; returns { name, text }.
export async function pickOpenFile() {
  const [h] = await window.showOpenFilePicker({
    types: [{ description: "OpenQual project", accept: { "application/json": [".json"] } }],
    multiple: false,
  });
  handle = h;
  await idbSet(KEY, handle);
  const file = await h.getFile();
  return { name: h.name, text: await file.text() };
}

// Write the serialised project to the linked file. Returns one of:
// "ok" | "no-handle" | "no-perm" | "error".
export async function writeProject(text) {
  if (!handle) return "no-handle";
  if (!(await ensureWritable(false))) return "no-perm";
  try {
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return "ok";
  } catch (e) {
    console.error("file autosave failed", e);
    return "error";
  }
}

export async function unlink() {
  handle = null;
  try { await idbDel(KEY); } catch (_) { /* ignore */ }
}
