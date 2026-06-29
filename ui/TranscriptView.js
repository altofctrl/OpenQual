// ui/TranscriptView.js
// Centre column: speaker-labelled turns with timestamps, overlapping-highlight
// rendering (section 6, breakpoint split — never nested backgrounds), text selection
// to apply codes/comments, per-segment two-mode editing (section 5), and the
// code-centric filter view.

import { html, useState, useRef, useMemo } from "./h.js";
import { actions } from "../store.js";
import { buildBreakpoints, codingsForSegment, commentsForSegment } from "../model/codings.js";

export function fmtTime(t) {
  if (t == null) return "";
  const s = Math.floor(t % 60), m = Math.floor((t / 60) % 60), h = Math.floor(t / 3600);
  const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

// Character offset of (node, offset) within root, in UTF-16 units (section 4).
function offsetWithin(root, node, nodeOffset) {
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(node, nodeOffset);
  return range.toString().length;
}

// Inline SVG icons for per-turn actions, so they render without an emoji font and read
// as real affordances on mobile (always visible there; hover-revealed on desktop).
const iconEdit = html`<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`;
const iconTrash = html`<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></svg>`;

const iconUpload = html`<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M12 16V3"/><path d="M7 8l5-5 5 5"/></svg>`;

function codeColor(codes, id) { return codes.find((c) => c.id === id)?.color || "#888"; }
function codeName(codes, id) { return codes.find((c) => c.id === id)?.name || "?"; }

// A combined drag-and-drop / click-to-browse target for the empty state. Accepts a .vtt
// transcript or an exported .json project and routes each to the right ingest path.
function Dropzone() {
  const [over, setOver] = useState(false);
  const handle = (files) => {
    for (const f of [...files]) {
      const n = f.name.toLowerCase();
      if (n.endsWith(".vtt")) actions.ingestVttFile(f);
      else if (n.endsWith(".json")) actions.importProjectFile(f);
      else alert(`Unsupported file "${f.name}". Drop a .vtt transcript or a .json project file.`);
    }
  };
  const browse = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".vtt,text/vtt,.json,application/json"; input.multiple = true;
    input.onchange = () => input.files.length && handle(input.files);
    input.click();
  };
  return html`
    <div class="dropzone ${over ? "over" : ""}" role="button" tabindex="0" onClick=${browse}
      onDragOver=${(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave=${(e) => { e.preventDefault(); setOver(false); }}
      onDrop=${(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}>
      <div class="dz-icon">${iconUpload}</div>
      <h2>Drop a transcript to start</h2>
      <p>Drag a <b>.vtt</b> file (or an exported <b>.json</b> project) here, or <b>click to browse</b>.</p>
      <p class="dz-alt">Rough notes instead? Use <b>Paste text</b> in the menu to turn them into speaker turns with the LLM.</p>
    </div>`;
}

function Segment({ seg, doc, project, ui }) {
  const rootRef = useRef(null);
  const [draft, setDraft] = useState(seg.text);
  const editing = ui.editingSegmentId === seg.id;

  const codings = useMemo(() => codingsForSegment(project, seg.id), [project.codings, seg.id]);
  const comments = useMemo(() => commentsForSegment(project, seg.id), [project.comments, seg.id]);
  const pieces = useMemo(() => buildBreakpoints(seg.text.length, codings, comments), [seg.text, codings, comments]);

  const onMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !rootRef.current) return;
    const range = sel.getRangeAt(0);
    if (!rootRef.current.contains(range.commonAncestorContainer)) return;
    const start = offsetWithin(rootRef.current, range.startContainer, range.startOffset);
    const end = offsetWithin(rootRef.current, range.endContainer, range.endOffset);
    const lo = Math.min(start, end), hi = Math.max(start, end);
    if (hi <= lo) return;
    const rect = range.getBoundingClientRect();
    window.__openqualSelection = { documentId: doc.id, segmentId: seg.id, start: lo, length: hi - lo };
    showToolbar(rect, window.__openqualSelection);
  };

  if (editing) {
    return html`
      <div class="segment editing">
        <div class="seg-meta"><span class="speaker">${seg.speaker}</span><span class="time">${fmtTime(seg.tStart)}</span>
          <span class="edit-badge">editing — raw text</span>
          <button class="del-toggle" title="delete this turn" onClick=${() => actions.deleteSegment(seg.id)}>${iconTrash}</button></div>
        <textarea class="seg-edit" value=${draft} autofocus
          onInput=${(e) => setDraft(e.target.value)}
          onBlur=${() => actions.commitSegmentEdit(seg.id, draft)}
          onKeyDown=${(e) => { if (e.key === "Escape") { setDraft(seg.text); actions.cancelEdit(); } if ((e.metaKey || e.ctrlKey) && e.key === "Enter") actions.commitSegmentEdit(seg.id, draft); }} />
        <div class="seg-edit-actions">
          <button onClick=${() => actions.commitSegmentEdit(seg.id, draft)}>Save</button>
          <button class="ghost" onClick=${() => { setDraft(seg.text); actions.cancelEdit(); }}>Cancel</button>
          <span class="hint">codings remap on save · deleted spans go to the unanchored tray</span>
        </div>
      </div>`;
  }

  return html`
    <div class="segment" id=${`seg-${seg.id}`}>
      <div class="seg-meta">
        <span class="speaker">${seg.speaker}</span>
        <span class="time">${fmtTime(seg.tStart)}</span>
        <button class="edit-toggle" title="edit this turn's text" onClick=${() => { setDraft(seg.text); actions.enterEdit(seg.id); }}>${iconEdit}</button>
        <button class="del-toggle" title="delete this turn (e.g. an STT mishearing)" onClick=${() => actions.deleteSegment(seg.id)}>${iconTrash}</button>
      </div>
      <div class="seg-text" ref=${rootRef} onMouseUp=${onMouseUp}>
        ${pieces.map((p, i) => {
          const text = seg.text.slice(p.start, p.end);
          if (p.codeIds.length === 0 && p.commentIds.length === 0) return html`<span key=${i}>${text}</span>`;
          // Stacked underlines, one colour per code — no nested background fills.
          const shadows = p.codeIds.map((cid, k) => `inset 0 ${-2 * (k + 1)}px 0 ${codeColor(project.codes, cid)}`);
          const style = {
            boxShadow: shadows.join(", "),
            paddingBottom: `${2 * p.codeIds.length}px`,
            background: p.commentIds.length ? "rgba(255, 214, 102, 0.18)" : "transparent",
          };
          const labelCodes = p.codeIds.map((c) => codeName(project.codes, c)).join(", ");
          return html`<span key=${i} class="coded" style=${style}
            title=${`${labelCodes}${p.commentIds.length ? " · 💬 comment" : ""}`}
            onClick=${(e) => openPopover(e, p, project, doc, seg)}>${text}</span>`;
        })}
      </div>
    </div>`;
}

// --- floating selection toolbar (apply code / new code / comment) ---------------
let toolbarSetter = null;
export function registerToolbar(setter) { toolbarSetter = setter; }
function showToolbar(rect, selection) {
  if (toolbarSetter) toolbarSetter({ x: rect.left, y: rect.bottom + window.scrollY + 6, selection });
}

// The most recent text selection, kept alive only while the selection toolbar is up.
// The code tree reads this so clicking a code name applies it to the selected text.
export function getLiveSelection() { return window.__openqualSelection || null; }
export function clearLiveSelection() { window.__openqualSelection = null; if (toolbarSetter) toolbarSetter(null); }

// Briefly highlight a turn — used to confirm a code was just applied to its text.
export function flashSegment(segId) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(`seg-${segId}`);
  if (el) { el.classList.add("seg-flash"); setTimeout(() => el.classList.remove("seg-flash"), 1000); }
}

// --- coded-span popover (list codes, remove, comment) ---------------------------
let popoverSetter = null;
export function registerPopover(setter) { popoverSetter = setter; }
function openPopover(e, piece, project, doc, seg) {
  e.stopPropagation();
  if (popoverSetter) popoverSetter({ x: e.clientX, y: e.clientY + window.scrollY + 6, piece, segmentId: seg.id, documentId: doc.id });
}

export function SelectionToolbar({ data, project, onClose }) {
  if (!data) return null;
  const { selection } = data;
  return html`
    <div class="floating toolbar" style=${{ left: data.x, top: data.y }} onMouseDown=${(e) => e.stopPropagation()}>
      <span class="tb-label">Apply:</span>
      ${project.codes.length === 0
        ? html`<button onClick=${() => { const c = actions.addCode("New code", null); actions.applyCode(selection, c.id); flashSegment(selection.segmentId); onClose(); }}>＋ New code</button>`
        : html`<select onChange=${(e) => { if (e.target.value) { actions.applyCode(selection, e.target.value); flashSegment(selection.segmentId); onClose(); } }}>
            <option value="">— pick code —</option>
            ${project.codes.map((c) => html`<option value=${c.id}>${c.name}</option>`)}
          </select>`}
      <button title="create a code and apply it" onClick=${() => { const name = prompt("New code name:"); if (name) { const c = actions.addCode(name, null); actions.applyCode(selection, c.id); flashSegment(selection.segmentId); } onClose(); }}>＋ Code</button>
      <button title="add a span comment" onClick=${() => { actions.addComment(selection, ""); onClose(); }}>💬 Comment</button>
      ${project.codes.length > 0 ? html`<span class="tb-hint">or click a code →</span>` : null}
      <button class="ghost" onClick=${onClose}>✕</button>
    </div>`;
}

export function SpanPopover({ data, project, onClose }) {
  if (!data) return null;
  const { piece } = data;
  return html`
    <div class="floating popover" style=${{ left: data.x, top: data.y }} onMouseDown=${(e) => e.stopPropagation()}>
      ${piece.codingIds.map((cdId) => {
        const cd = project.codings.find((c) => c.id === cdId);
        if (!cd) return null;
        return html`<div class="pop-row" key=${cdId}>
          <span class="pop-dot" style=${{ background: codeColor(project.codes, cd.codeId) }}></span>
          <span class="pop-name" onClick=${() => { actions.selectCoding(cdId); onClose(); }}>${codeName(project.codes, cd.codeId)}</span>
          <button title="remove this coding" onClick=${() => { actions.removeCoding(cdId); onClose(); }}>✕</button>
        </div>`;
      })}
      ${piece.commentIds.map((cmId) => html`<div class="pop-row comment" key=${cmId}>
        <span class="pop-dot">💬</span>
        <span class="pop-name" onClick=${() => { actions.selectComment(cmId); onClose(); }}>comment…</span>
        <button title="delete comment" onClick=${() => { actions.deleteComment(cmId); onClose(); }}>✕</button>
      </div>`)}
      ${piece.codingIds.length === 0 && piece.commentIds.length === 0 ? html`<span class="empty">no codes here</span>` : null}
    </div>`;
}

export function TranscriptView({ project, ui, doc: docProp }) {
  const doc = docProp || actions.activeDoc();
  if (!doc) {
    return html`<div class="transcript empty-state"><${Dropzone} /></div>`;
  }

  // Isolating a code (the ⤓ button in the code tree) no longer takes over the centre —
  // its passages are listed in the right-hand panel so the transcript stays in view.
  return html`
    <div class="transcript" style=${{ fontSize: ui.fontSize }} onMouseDown=${() => { clearLiveSelection(); if (popoverSetter) popoverSetter(null); }}>
      ${doc.segments.map((seg) => html`<${Segment} key=${seg.id} seg=${seg} doc=${doc} project=${project} ui=${ui} />`)}
    </div>`;
}
