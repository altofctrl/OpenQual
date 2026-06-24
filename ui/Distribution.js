// ui/Distribution.js
// Simple code-frequency table and code co-occurrence matrix (section 3 "later", capped
// at simple counts by the non-goals in section 2). Co-occurrence counts segments where
// two codes both appear.

import { html } from "./h.js";
import { codeFrequency } from "../model/codings.js";

function coOccurrence(project) {
  // For each segment, the set of codes present; bump every unordered pair.
  const bySeg = {};
  for (const cd of project.codings) (bySeg[cd.segmentId] ||= new Set()).add(cd.codeId);
  const pairs = {};
  for (const set of Object.values(bySeg)) {
    const ids = [...set];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const key = [ids[i], ids[j]].sort().join("|");
        pairs[key] = (pairs[key] || 0) + 1;
      }
  }
  return pairs;
}

export function Distribution({ project }) {
  const freq = codeFrequency(project);
  const codes = [...project.codes].sort((a, b) => (freq[b.id] || 0) - (freq[a.id] || 0));
  const pairs = Object.entries(coOccurrence(project)).sort((a, b) => b[1] - a[1]);
  const name = (id) => project.codes.find((c) => c.id === id)?.name || "?";

  return html`
    <div class="transcript distribution">
      <h2>Code frequency</h2>
      <table class="dist">
        <thead><tr><th>Code</th><th>Codings</th></tr></thead>
        <tbody>
          ${codes.map((c) => html`<tr key=${c.id}>
            <td><span class="pop-dot" style=${{ background: c.color }}></span> ${c.name}</td>
            <td>${freq[c.id] || 0}</td></tr>`)}
        </tbody>
      </table>
      <h2>Co-occurrence (same turn)</h2>
      ${pairs.length === 0 ? html`<p class="empty">No two codes share a turn yet.</p>`
        : html`<table class="dist"><thead><tr><th>Code A</th><th>Code B</th><th>Turns</th></tr></thead>
          <tbody>${pairs.map(([k, n]) => { const [a, b] = k.split("|"); return html`<tr key=${k}><td>${name(a)}</td><td>${name(b)}</td><td>${n}</td></tr>`; })}</tbody>
        </table>`}
    </div>`;
}
