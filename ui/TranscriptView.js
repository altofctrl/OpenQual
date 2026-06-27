// ui/TranscriptView.js
// Centre column: speaker-labelled turns with timestamps, overlapping-highlight
// rendering (section 6, breakpoint split — never nested backgrounds), text selection
// to apply codes/comments, per-segment two-mode editing (section 5), and the
// code-centric filter view.

import { html, useState, useRef, useMemo } from "./h.js";
import { actions } from "../store.js";
import { buildBreakpoints, codingsForSegment, commentsForSegment } from "../model/codings.js";

function fmtTime(t) {
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

function codeColor(codes, id) { return codes.find((c) => c.id === id)?.color || "#888"; }
function codeName(codes, id) { return codes.find((c) => c.id === id)?.name || "?"; }

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
    <div class="segment">
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
        ? html`<button onClick=${() => { const c = actions.addCode("New code", null); actions.applyCode(selection, c.id); onClose(); }}>＋ New code</button>`
        : html`<select onChange=${(e) => { if (e.target.value) { actions.applyCode(selection, e.target.value); onClose(); } }}>
            <option value="">— pick code —</option>
            ${project.codes.map((c) => html`<option value=${c.id}>${c.name}</option>`)}
          </select>`}
      <button title="create a code and apply it" onClick=${() => { const name = prompt("New code name:"); if (name) { const c = actions.addCode(name, null); actions.applyCode(selection, c.id); } onClose(); }}>＋ Code</button>
      <button title="add a span comment" onClick=${() => { actions.addComment(selection, ""); onClose(); }}>💬 Comment</button>
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

export function TranscriptView({ project, ui }) {
  const doc = actions.activeDoc();
  if (!doc) {
    return html`<div class="transcript empty-state">
      <h2>No transcript loaded</h2>
      <p>Use <b>Load VTT</b> for a Teams transcript, or <b>Paste text</b> to normalise rough text with the LLM.</p>
    </div>`;
  }

  // Code-centric view (section 6): filter to segments containing the active code and
  // lift coded passages into a list while still allowing a jump back to the full turn.
  if (ui.filterCodeId) {
    const code = project.codes.find((c) => c.id === ui.filterCodeId);
    const hits = project.codings.filter((c) => c.codeId === ui.filterCodeId);
    return html`
      <div class="transcript" style=${{ fontSize: ui.fontSize }}>
        <div class="filter-bar">
          Showing passages coded <b style=${{ color: code?.color }}>${code?.name}</b> (${hits.length})
          <button class="ghost" onClick=${() => actions.setFilterCode(null)}>← back to full transcript</button>
        </div>
        ${hits.length === 0 ? html`<p class="empty">No passages use this code yet.</p>` : null}
        ${hits.map((cd) => {
          const seg = doc.segments.find((s) => s.id === cd.segmentId)
            || project.documents.flatMap((d) => d.segments).find((s) => s.id === cd.segmentId);
          if (!seg) return null;
          return html`<div class="lifted" key=${cd.id}>
            <div class="lifted-meta">${seg.speaker} · ${fmtTime(seg.tStart)}</div>
            <blockquote>${seg.text.slice(cd.start, cd.start + cd.length)}</blockquote>
            <button class="ghost" onClick=${() => actions.setFilterCode(null)}>jump to turn</button>
          </div>`;
        })}
      </div>`;
  }

  return html`
    <div class="transcript" style=${{ fontSize: ui.fontSize }} onMouseDown=${() => { if (toolbarSetter) toolbarSetter(null); if (popoverSetter) popoverSetter(null); }}>
      ${doc.segments.map((seg) => html`<${Segment} key=${seg.id} seg=${seg} doc=${doc} project=${project} ui=${ui} />`)}
    </div>`;
}
