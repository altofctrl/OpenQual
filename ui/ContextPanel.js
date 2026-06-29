// ui/ContextPanel.js
// Right column. Switches between: the active code's memo, a selected coding's details,
// and the span-comment editor (section 8). Also surfaces the unanchored tray (section
// 5) and the document list.

import { html } from "./h.js";
import { actions } from "../store.js";
import { fmtTime } from "./TranscriptView.js";

// "Isolate" results: the passages coded with the chosen code, listed in the side panel
// (the transcript stays visible in the centre). Clicking a passage jumps to its turn.
function IsolatedPanel({ project, ui }) {
  if (!ui.filterCodeId) return null;
  const code = project.codes.find((c) => c.id === ui.filterCodeId);
  const hits = project.codings.filter((c) => c.codeId === ui.filterCodeId);
  const segments = project.documents.flatMap((d) => d.segments);

  const jump = (segId) => {
    const owner = project.documents.find((d) => d.segments.some((s) => s.id === segId));
    if (owner && ui.activeDocumentId && ui.activeDocumentId !== owner.id) actions.setActiveDocument(owner.id);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches) actions.closeMobilePanel();
    setTimeout(() => {
      const el = document.getElementById(`seg-${segId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("seg-flash");
        setTimeout(() => el.classList.remove("seg-flash"), 1200);
      }
    }, 80);
  };

  return html`
    <div class="isolated">
      <div class="panel-head">
        <span><span class="pop-dot" style=${{ background: code?.color || "#bbb" }}></span> Isolated · ${code?.name || "?"} (${hits.length})</span>
        <button class="ghost" title="clear isolation" onClick=${() => actions.setFilterCode(null)}>✕</button>
      </div>
      ${hits.length === 0
        ? html`<p class="empty">No passages use this code yet. Select transcript text and click the code to apply it.</p>`
        : null}
      <div class="iso-list">
        ${hits.map((cd) => {
          const seg = segments.find((s) => s.id === cd.segmentId);
          if (!seg) return null;
          return html`<div class="iso-item" key=${cd.id} onClick=${() => jump(seg.id)} title="jump to this turn">
            <div class="iso-meta">${seg.speaker} · ${fmtTime(seg.tStart)}</div>
            <blockquote>${seg.text.slice(cd.start, cd.start + cd.length)}</blockquote>
          </div>`;
        })}
      </div>
    </div>`;
}

function DocList({ project, ui }) {
  return html`
    <div class="doclist">
      <div class="panel-head"><span>Documents</span></div>
      ${project.documents.length === 0 ? html`<p class="empty">none yet</p>` : null}
      ${project.documents.map((d) => html`
        <div class="docrow ${ui.activeDocumentId === d.id ? "sel" : ""}" key=${d.id}
          onClick=${() => actions.setActiveDocument(d.id)}>
          <span class="docname">${d.title}</span>
          <span class="docmeta">${d.segments.length} turns</span>
        </div>`)}
    </div>`;
}

function CodeMemo({ project, ui }) {
  const code = project.codes.find((c) => c.id === ui.selectedCodeId);
  if (!code) return html`<p class="empty">Select a code to edit its memo.</p>`;
  return html`
    <div class="ctx-block">
      <div class="ctx-title"><span class="pop-dot" style=${{ background: code.color }}></span> ${code.name}</div>
      <label class="ctx-label">Code memo</label>
      <textarea class="memo" placeholder="What does this code mean? Inclusion/exclusion rules…"
        value=${code.memo || ""} onInput=${(e) => actions.updateCode(code.id, { memo: e.target.value })}></textarea>
    </div>`;
}

function CommentEditor({ project, ui }) {
  const comment = project.comments.find((c) => c.id === ui.selectedCommentId);
  if (!comment) return html`<p class="empty">No comment selected.</p>`;
  const seg = project.documents.flatMap((d) => d.segments).find((s) => s.id === comment.segmentId);
  return html`
    <div class="ctx-block">
      <div class="ctx-title">💬 Span comment</div>
      ${seg ? html`<blockquote class="ctx-quote">${seg.text.slice(comment.start, comment.start + comment.length)}</blockquote>` : null}
      <label class="ctx-label">Comment</label>
      <textarea class="memo" placeholder="Note about this passage…" value=${comment.text}
        onInput=${(e) => actions.updateComment(comment.id, e.target.value)}></textarea>
      <button class="ghost" onClick=${() => actions.deleteComment(comment.id)}>Delete comment</button>
    </div>`;
}

function CodingInfo({ project, ui }) {
  const cd = project.codings.find((c) => c.id === ui.selectedCodingId);
  if (!cd) return html`<p class="empty">No coding selected.</p>`;
  const code = project.codes.find((c) => c.id === cd.codeId);
  const seg = project.documents.flatMap((d) => d.segments).find((s) => s.id === cd.segmentId);
  return html`
    <div class="ctx-block">
      <div class="ctx-title"><span class="pop-dot" style=${{ background: code?.color }}></span> ${code?.name || "?"}</div>
      ${seg ? html`<blockquote class="ctx-quote">${seg.text.slice(cd.start, cd.start + cd.length)}</blockquote>` : null}
      <div class="ctx-meta">${seg?.speaker} · offset ${cd.start}, len ${cd.length}</div>
      <button class="ghost" onClick=${() => actions.removeCoding(cd.id)}>Remove this coding</button>
    </div>`;
}

function UnanchoredTray({ project }) {
  const orphans = project.unanchored || [];
  if (orphans.length === 0) return null;
  return html`
    <div class="tray">
      <div class="panel-head"><span>⚠ Unanchored (${orphans.length})</span></div>
      <p class="tiny">These codings lost their span during an edit. Select transcript text, then Reattach — or discard.</p>
      ${orphans.map((o) => {
        const code = project.codes.find((c) => c.id === o.codeId);
        return html`<div class="orphan" key=${o.id}>
          <span class="pop-dot" style=${{ background: code?.color || "#bbb" }}></span>
          <span class="orphan-name">${code ? code.name : "comment"}</span>
          <em class="orphan-text">“${(o._oldText || o.text || "").slice(0, 30)}”</em>
          <button title="reattach to current selection" onClick=${() => { const sel = window.__openqualSelection; if (!sel) { alert("Select transcript text first, then click Reattach."); return; } actions.reattachOrphan(o.id, sel); }}>⤿</button>
          <button title="discard" onClick=${() => actions.discardOrphan(o.id)}>✕</button>
        </div>`;
      })}
    </div>`;
}

export function ContextPanel({ project, ui }) {
  let body;
  if (ui.contextMode === "comment") body = html`<${CommentEditor} project=${project} ui=${ui} />`;
  else if (ui.contextMode === "coding") body = html`<${CodingInfo} project=${project} ui=${ui} />`;
  else body = html`<${CodeMemo} project=${project} ui=${ui} />`;

  return html`
    <div class="context">
      <${IsolatedPanel} project=${project} ui=${ui} />
      <${DocList} project=${project} ui=${ui} />
      <div class="ctx-tabs">
        <button class=${ui.contextMode === "code" ? "on" : ""} onClick=${() => actions.store.patchUi({ contextMode: "code" })}>Code memo</button>
        <button class=${ui.contextMode === "coding" ? "on" : ""} onClick=${() => actions.store.patchUi({ contextMode: "coding" })}>Coding</button>
        <button class=${ui.contextMode === "comment" ? "on" : ""} onClick=${() => actions.store.patchUi({ contextMode: "comment" })}>Comment</button>
      </div>
      <div class="ctx-body">${body}</div>
      <${UnanchoredTray} project=${project} />
    </div>`;
}
