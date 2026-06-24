// store.js
// Central state store + high-level actions (the brief lists this under app.js §12;
// kept as its own module so UI components import it without a circular edge back to
// the bootstrap). A tiny pub/sub over a single immutable-ish state object; the
// useStore() hook wires Preact re-renders.

import { useState, useEffect } from "./ui/h.js";
import { emptyProject, uid } from "./model/schema.js";
import { makeCoding, makeComment, hasCoding } from "./model/codings.js";
import { remapSegment } from "./model/remap.js";
import { parseVtt } from "./ingest/vtt.js";
import { normaliseText } from "./ingest/text-llm.js";
import { downloadProject, loadProjectFromFile, serialiseProject } from "./io/projectFile.js";

const PROJECT_KEY = "openqual.project";
const SETTINGS_KEY = "openqual.settings";

const DEFAULT_SETTINGS = {
  scope: "session", // "session" | "local" — where the secrets live (section 9)
  llm: { provider: "anthropic", endpoint: "", model: "claude-haiku-4-5", key: "" },
  whisper: { endpoint: "", model: "whisper-1", key: "" },
  picovoice: { accessKey: "" },
};

// ---- persistence ---------------------------------------------------------------

function loadSettings() {
  for (const storage of [sessionStorage, localStorage]) {
    try {
      const raw = storage.getItem(SETTINGS_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (_) { /* ignore */ }
  }
  return { ...DEFAULT_SETTINGS };
}

function persistSettings(settings) {
  // Keys live in browser storage only and never in the project JSON (section 9).
  // Honour the chosen scope and clear the other storage so a key cannot linger.
  const blob = JSON.stringify(settings);
  if (settings.scope === "local") {
    localStorage.setItem(SETTINGS_KEY, blob);
    sessionStorage.removeItem(SETTINGS_KEY);
  } else {
    sessionStorage.setItem(SETTINGS_KEY, blob);
    localStorage.removeItem(SETTINGS_KEY);
  }
}

function loadAutosaved() {
  try {
    const raw = localStorage.getItem(PROJECT_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (!Array.isArray(p.unanchored)) p.unanchored = [];
      return p;
    }
  } catch (_) { /* ignore */ }
  return null;
}

// ---- store ---------------------------------------------------------------------

const store = {
  state: {
    project: loadAutosaved() || emptyProject("Untitled project"),
    settings: loadSettings(),
    ui: {
      activeDocumentId: null,
      selectedCodeId: null,     // active code: drives the memo panel + quick apply
      mruCodeId: null,          // most-recently-used code (keyboard apply, section 8)
      filterCodeId: null,       // code-centric view: filter transcript to this code
      editingSegmentId: null,   // segment currently in edit mode
      contextMode: "code",      // "code" | "coding" | "comment"
      selectedCodingId: null,
      selectedCommentId: null,
      hidePanels: false,
      fontSize: 16,
      view: "transcript",       // "transcript" | "distribution"
      settingsOpen: false,
      status: "",               // transient status line (e.g. "Ingesting…")
    },
    savedAt: null,
  },
  listeners: new Set(),

  get() { return this.state; },
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { for (const fn of this.listeners) fn(this.state); },

  patchUi(patch) {
    this.state = { ...this.state, ui: { ...this.state.ui, ...patch } };
    this.emit();
  },

  // Replace the project, touch updatedAt, and schedule an autosave.
  setProject(project, { autosave = true } = {}) {
    project.project.updatedAt = new Date().toISOString();
    this.state = { ...this.state, project };
    this.emit();
    if (autosave) scheduleAutosave();
  },

  setSettings(settings) {
    this.state = { ...this.state, settings };
    persistSettings(settings);
    this.emit();
  },
};

// debounced autosave to localStorage (section 8: persistent autosave)
let autosaveTimer = null;
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(PROJECT_KEY, serialiseProject(store.state.project));
      store.state = { ...store.state, savedAt: new Date().toISOString() };
      store.emit();
    } catch (e) {
      console.error("autosave failed", e);
    }
  }, 600);
}

// ---- hook ----------------------------------------------------------------------

export function useStore() {
  const [, force] = useState(0);
  useEffect(() => store.subscribe(() => force((n) => n + 1)), []);
  return store.state;
}

// ---- helpers -------------------------------------------------------------------

function activeDoc(state) {
  const id = state.ui.activeDocumentId;
  return state.project.documents.find((d) => d.id === id) || state.project.documents[0] || null;
}

// ---- actions -------------------------------------------------------------------

export const actions = {
  store,
  activeDoc: () => activeDoc(store.state),

  newProject() {
    if (!confirm("Start a new project? Unexported changes will be lost.")) return;
    store.setProject(emptyProject("Untitled project"));
    store.patchUi({ activeDocumentId: null, selectedCodeId: null, filterCodeId: null, editingSegmentId: null });
  },

  setStatus(status) { store.patchUi({ status }); },

  // ---- ingest ----
  async ingestVttFile(file) {
    store.patchUi({ status: `Parsing ${file.name}…` });
    try {
      const text = await file.text();
      const doc = parseVtt(text, file.name.replace(/\.vtt$/i, ""));
      this._addDocument(doc);
    } catch (e) {
      alert(`VTT parse failed: ${e.message}`);
    } finally {
      store.patchUi({ status: "" });
    }
  },

  async ingestPastedText(rawText, title) {
    const cfg = store.state.settings.llm;
    store.patchUi({ status: "Normalising with LLM…" });
    try {
      const doc = await normaliseText(rawText, cfg, title || "Pasted transcript");
      this._addDocument(doc);
    } catch (e) {
      alert(`Text normalisation failed: ${e.message}`);
    } finally {
      store.patchUi({ status: "" });
    }
  },

  _addDocument(doc) {
    const p = store.state.project;
    const project = { ...p, documents: [...p.documents, doc] };
    if (!project.project.title || project.project.title === "Untitled project") {
      project.project = { ...project.project, title: doc.title };
    }
    store.setProject(project);
    store.patchUi({ activeDocumentId: doc.id });
  },

  setActiveDocument(id) { store.patchUi({ activeDocumentId: id, filterCodeId: null, editingSegmentId: null }); },

  // ---- code tree ----
  addCode(name = "New code", parentId = null) {
    const p = store.state.project;
    const siblings = p.codes.filter((c) => c.parentId === parentId);
    const order = siblings.length;
    const palette = ["#D2A2D7", "#A2C4D7", "#A2D7B5", "#D7C9A2", "#D7A2A2", "#B5A2D7", "#A2D7D2"];
    const color = palette[p.codes.length % palette.length];
    const code = { id: uid("c"), name, color, parentId, order, memo: "" };
    store.setProject({ ...p, codes: [...p.codes, code] });
    store.patchUi({ selectedCodeId: code.id, contextMode: "code" });
    return code;
  },

  updateCode(id, patch) {
    const p = store.state.project;
    store.setProject({ ...p, codes: p.codes.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  },

  deleteCode(id) {
    const p = store.state.project;
    // Collect the code and all descendants.
    const toRemove = new Set([id]);
    let added = true;
    while (added) {
      added = false;
      for (const c of p.codes) {
        if (c.parentId && toRemove.has(c.parentId) && !toRemove.has(c.id)) { toRemove.add(c.id); added = true; }
      }
    }
    if (!confirm(`Delete this code${toRemove.size > 1 ? " and its subcodes" : ""}? Codings using it will be removed.`)) return;
    store.setProject({
      ...p,
      codes: p.codes.filter((c) => !toRemove.has(c.id)),
      codings: p.codings.filter((cd) => !toRemove.has(cd.codeId)),
    });
    if (toRemove.has(store.state.ui.selectedCodeId)) store.patchUi({ selectedCodeId: null });
  },

  // Re-nest a code under newParentId (or root). Guards against cycles.
  nestCode(id, newParentId) {
    if (id === newParentId) return;
    const p = store.state.project;
    // prevent moving a node under its own descendant
    let cur = newParentId;
    while (cur) {
      if (cur === id) return;
      cur = p.codes.find((c) => c.id === cur)?.parentId || null;
    }
    const order = p.codes.filter((c) => c.parentId === newParentId).length;
    this.updateCode(id, { parentId: newParentId, order });
  },

  reorderCode(id, delta) {
    const p = store.state.project;
    const code = p.codes.find((c) => c.id === id);
    if (!code) return;
    const siblings = p.codes.filter((c) => c.parentId === code.parentId).sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex((c) => c.id === id);
    const swap = siblings[idx + delta];
    if (!swap) return;
    const a = code.order, b = swap.order;
    store.setProject({
      ...p,
      codes: p.codes.map((c) => (c.id === id ? { ...c, order: b } : c.id === swap.id ? { ...c, order: a } : c)),
    });
  },

  selectCode(id) { store.patchUi({ selectedCodeId: id, mruCodeId: id, contextMode: "code" }); },

  // ---- coding ----
  // selection: { documentId, segmentId, start, length }
  applyCode(selection, codeId) {
    if (!selection || selection.length <= 0 || !codeId) return;
    const p = store.state.project;
    if (hasCoding(p, selection.segmentId, selection.start, selection.length, codeId)) return;
    const coding = makeCoding(selection.documentId, selection.segmentId, selection.start, selection.length, codeId);
    store.setProject({ ...p, codings: [...p.codings, coding] });
    store.patchUi({ mruCodeId: codeId });
  },

  removeCoding(codingId) {
    const p = store.state.project;
    store.setProject({ ...p, codings: p.codings.filter((c) => c.id !== codingId) });
    if (store.state.ui.selectedCodingId === codingId) store.patchUi({ selectedCodingId: null, contextMode: "code" });
  },

  selectCoding(codingId) { store.patchUi({ selectedCodingId: codingId, contextMode: "coding" }); },

  // ---- comments ----
  addComment(selection, text = "") {
    if (!selection || selection.length <= 0) return null;
    const p = store.state.project;
    const comment = makeComment(selection.documentId, selection.segmentId, selection.start, selection.length, text);
    store.setProject({ ...p, comments: [...p.comments, comment] });
    store.patchUi({ selectedCommentId: comment.id, contextMode: "comment" });
    return comment;
  },

  updateComment(id, text) {
    const p = store.state.project;
    store.setProject({ ...p, comments: p.comments.map((c) => (c.id === id ? { ...c, text } : c)) });
  },

  deleteComment(id) {
    const p = store.state.project;
    store.setProject({ ...p, comments: p.comments.filter((c) => c.id !== id) });
    if (store.state.ui.selectedCommentId === id) store.patchUi({ selectedCommentId: null, contextMode: "code" });
  },

  selectComment(id) { store.patchUi({ selectedCommentId: id, contextMode: "comment" }); },

  // ---- editing (two-mode, section 5) ----
  enterEdit(segmentId) { store.patchUi({ editingSegmentId: segmentId }); },
  cancelEdit() { store.patchUi({ editingSegmentId: null }); },

  commitSegmentEdit(segmentId, newText) {
    const p = store.state.project;
    const doc = p.documents.find((d) => d.segments.some((s) => s.id === segmentId));
    if (!doc) { store.patchUi({ editingSegmentId: null }); return; }
    const seg = doc.segments.find((s) => s.id === segmentId);
    const oldText = seg.text;
    if (oldText === newText) { store.patchUi({ editingSegmentId: null }); return; }

    const { codings, comments, orphans } = remapSegment(p, segmentId, oldText, newText);
    const documents = p.documents.map((d) =>
      d.id !== doc.id ? d : { ...d, segments: d.segments.map((s) => (s.id === segmentId ? { ...s, text: newText } : s)) },
    );
    // Orphaned codings go to a visible tray — never lost silently (section 5).
    const unanchored = [...(p.unanchored || []), ...orphans.map((o) => ({ ...o, documentId: doc.id }))];
    store.setProject({ ...p, documents, codings, comments, unanchored });
    store.patchUi({ editingSegmentId: null });
    if (orphans.length) store.patchUi({ status: `${orphans.length} coding(s) became unanchored after the edit.` });
  },

  // Reattach an unanchored coding to the current selection, or discard it.
  reattachOrphan(orphanId, selection) {
    const p = store.state.project;
    const orphan = (p.unanchored || []).find((o) => o.id === orphanId);
    if (!orphan || !selection || selection.length <= 0) return;
    const restored = orphan.codeId
      ? makeCoding(selection.documentId, selection.segmentId, selection.start, selection.length, orphan.codeId)
      : makeComment(selection.documentId, selection.segmentId, selection.start, selection.length, orphan.text || "");
    const key = orphan.codeId ? "codings" : "comments";
    store.setProject({
      ...p,
      [key]: [...p[key], restored],
      unanchored: p.unanchored.filter((o) => o.id !== orphanId),
    });
  },

  discardOrphan(orphanId) {
    const p = store.state.project;
    store.setProject({ ...p, unanchored: p.unanchored.filter((o) => o.id !== orphanId) });
  },

  // ---- code-centric view (section 6) ----
  setFilterCode(codeId) { store.patchUi({ filterCodeId: codeId }); },

  // ---- project IO ----
  exportProject() { downloadProject(store.state.project); },
  async importProjectFile(file) {
    const res = await loadProjectFromFile(file);
    if (!res.ok) { alert(`Could not load project:\n${res.errors.join("\n")}`); return; }
    store.setProject(res.project);
    store.patchUi({ activeDocumentId: res.project.documents[0]?.id || null, selectedCodeId: null, filterCodeId: null });
  },

  // ---- settings ----
  saveSettings(settings) { store.setSettings(settings); store.patchUi({ settingsOpen: false }); },
  openSettings() { store.patchUi({ settingsOpen: true }); },
  closeSettings() { store.patchUi({ settingsOpen: false }); },

  // ---- view chrome ----
  toggleHidePanels() { store.patchUi({ hidePanels: !store.state.ui.hidePanels }); },
  setFontSize(px) { store.patchUi({ fontSize: Math.max(11, Math.min(28, px)) }); },
  setView(view) { store.patchUi({ view }); },
};
