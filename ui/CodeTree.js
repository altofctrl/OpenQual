// ui/CodeTree.js
// Left-column hierarchical code tree (section 8). Create, rename, recolour, nest,
// reorder, delete codes; select a code to drive the memo panel and quick-apply.
// Drag a code onto another to renest (set parentId); arrows reorder siblings.

import { html, useState } from "./h.js";
import { actions } from "../store.js";
import { codeFrequency } from "../model/codings.js";

function childrenOf(codes, parentId) {
  return codes.filter((c) => c.parentId === parentId).sort((a, b) => a.order - b.order);
}

function CodeRow({ code, codes, freq, ui, depth }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(code.name);
  const kids = childrenOf(codes, code.id);
  const selected = ui.selectedCodeId === code.id;
  const filtered = ui.filterCodeId === code.id;

  const commit = () => { setEditing(false); if (name.trim() && name !== code.name) actions.updateCode(code.id, { name: name.trim() }); };

  return html`
    <div class="codenode" style=${{ marginLeft: depth ? 12 : 0 }}>
      <div
        class="coderow ${selected ? "sel" : ""} ${filtered ? "filtered" : ""}"
        draggable=${!editing}
        onDragStart=${(e) => { e.dataTransfer.setData("text/code-id", code.id); e.stopPropagation(); }}
        onDragOver=${(e) => e.preventDefault()}
        onDrop=${(e) => { e.preventDefault(); e.stopPropagation(); const id = e.dataTransfer.getData("text/code-id"); if (id) actions.nestCode(id, code.id); }}
        onClick=${() => actions.selectCode(code.id)}
        title="Click to select · drag onto another code to nest"
      >
        <input class="swatch" type="color" value=${code.color}
          onClick=${(e) => e.stopPropagation()}
          onInput=${(e) => actions.updateCode(code.id, { color: e.target.value })} />
        ${editing
          ? html`<input class="rename" value=${name} autofocus
              onClick=${(e) => e.stopPropagation()}
              onInput=${(e) => setName(e.target.value)}
              onBlur=${commit}
              onKeyDown=${(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setName(code.name); setEditing(false); } }} />`
          : html`<span class="cname" onDblClick=${(e) => { e.stopPropagation(); setEditing(true); }}>${code.name}</span>`}
        <span class="cfreq" title="codings using this code">${freq[code.id] || 0}</span>
        <span class="crow-actions" onClick=${(e) => e.stopPropagation()}>
          <button title="filter transcript to this code" class=${filtered ? "on" : ""}
            onClick=${() => actions.setFilterCode(filtered ? null : code.id)}>⤓</button>
          <button title="add subcode" onClick=${() => actions.addCode("New subcode", code.id)}>＋</button>
          <button title="move up" onClick=${() => actions.reorderCode(code.id, -1)}>↑</button>
          <button title="move down" onClick=${() => actions.reorderCode(code.id, 1)}>↓</button>
          <button title="delete" onClick=${() => actions.deleteCode(code.id)}>✕</button>
        </span>
      </div>
      ${kids.map((k) => html`<${CodeRow} key=${k.id} code=${k} codes=${codes} freq=${freq} ui=${ui} depth=${depth + 1} />`)}
    </div>`;
}

export function CodeTree({ project, ui }) {
  const roots = childrenOf(project.codes, null);
  const freq = codeFrequency(project);
  return html`
    <div class="codetree">
      <div class="panel-head">
        <span>Codes</span>
        <button class="addcode" onClick=${() => actions.addCode("New code", null)}>＋ Code</button>
      </div>
      <div
        class="tree-body"
        onDragOver=${(e) => e.preventDefault()}
        onDrop=${(e) => { const id = e.dataTransfer.getData("text/code-id"); if (id) actions.nestCode(id, null); }}
        title="drop here to move a code to the top level"
      >
        ${roots.length === 0
          ? html`<p class="empty">No codes yet. Add one, then select transcript text to apply it.</p>`
          : roots.map((c) => html`<${CodeRow} key=${c.id} code=${c} codes=${project.codes} freq=${freq} ui=${ui} depth=${0} />`)}
      </div>
    </div>`;
}
