// app.js
// Bootstrap: top bar, three-column layout, keyboard shortcuts, and the floating
// selection toolbar / coded-span popover overlays. State + autosave live in store.js.

import { html, render, useState, useEffect } from "./ui/h.js";
import { useStore, actions } from "./store.js";
import { CodeTree } from "./ui/CodeTree.js";
import { ContextPanel } from "./ui/ContextPanel.js";
import { Settings } from "./ui/Settings.js";
import { Distribution } from "./ui/Distribution.js";
import {
  TranscriptView, SelectionToolbar, SpanPopover, registerToolbar, registerPopover,
} from "./ui/TranscriptView.js";

function TopBar({ project, ui, settings }) {
  const saved = useStoreSavedLabel();
  const pick = (accept, cb) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = accept;
    input.onchange = () => input.files[0] && cb(input.files[0]);
    input.click();
  };
  return html`
    <header class="topbar">
      <div class="brand">OpenQual<span class="sub">qualitative coding</span></div>
      <input class="title-input" value=${project.project.title}
        onInput=${(e) => actions.store.setProject({ ...project, project: { ...project.project, title: e.target.value } })} />
      <div class="tb-group">
        <button onClick=${() => pick(".vtt,text/vtt", (f) => actions.ingestVttFile(f))}>Load VTT</button>
        <button onClick=${() => openPaste()}>Paste text</button>
      </div>
      <div class="tb-group">
        <button onClick=${() => actions.setView(ui.view === "distribution" ? "transcript" : "distribution")}>
          ${ui.view === "distribution" ? "Transcript" : "Distribution"}</button>
        <button onClick=${() => actions.toggleHidePanels()} title="focus mode">${ui.hidePanels ? "Show panels" : "Hide panels"}</button>
        <button onClick=${() => actions.setFontSize(ui.fontSize - 1)} title="smaller text">A−</button>
        <button onClick=${() => actions.setFontSize(ui.fontSize + 1)} title="larger text">A+</button>
      </div>
      <div class="tb-group">
        <button onClick=${() => actions.exportProject()}>Export</button>
        <button onClick=${() => pick(".json,application/json", (f) => actions.importProjectFile(f))}>Import</button>
        <button onClick=${() => actions.newProject()}>New</button>
        <button onClick=${() => actions.openSettings()} title="API keys & providers">⚙</button>
      </div>
      <div class="savebadge" title=${ui.status || ""}>
        ${ui.status ? html`<span class="busy">${ui.status}</span>` : saved}
      </div>
    </header>`;
}

function useStoreSavedLabel() {
  const state = useStore();
  if (!state.savedAt) return html`<span class="dim">not yet autosaved</span>`;
  const t = new Date(state.savedAt);
  return html`<span class="dim">autosaved ${t.toLocaleTimeString()}</span>`;
}

// Minimal paste dialog using a prompt-driven flow would be poor for long text, so use a
// lightweight inline modal.
let openPasteSetter = null;
function openPaste() { if (openPasteSetter) openPasteSetter(true); }

function PasteModal({ open, onClose }) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("Pasted transcript");
  if (!open) return null;
  return html`
    <div class="modal-backdrop" onMouseDown=${onClose}>
      <div class="modal" onMouseDown=${(e) => e.stopPropagation()}>
        <h2>Paste transcript text</h2>
        <p class="tiny">Rough or non-VTT text is sent to the configured LLM and normalised into speaker turns. Configure a key in ⚙ Settings first.</p>
        <label class="ctx-label">Document title</label>
        <input value=${title} onInput=${(e) => setTitle(e.target.value)} />
        <label class="ctx-label">Transcript</label>
        <textarea class="paste-area" value=${text} placeholder="Paste raw transcript here…" onInput=${(e) => setText(e.target.value)}></textarea>
        <div class="modal-actions">
          <button onClick=${async () => { if (text.trim()) { onClose(); await actions.ingestPastedText(text, title); } }}>Normalise with LLM</button>
          <button class="ghost" onClick=${onClose}>Cancel</button>
        </div>
      </div>
    </div>`;
}

// Gentle, occasional nudge to download a JSON backup. Work is autosaved to this
// browser's localStorage only, so a cleared cache / different device loses it. The
// hint stays out of the way: it appears at most once every REMIND_MS of elapsed time,
// only when there is unexported work, and "Later" snoozes it for another interval.
const REMIND_MS = 12 * 60 * 1000;

function BackupHint() {
  const { project, lastExportedAt } = useStore();
  const [sessionStart] = useState(() => Date.now());
  const [snoozedAt, setSnoozedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const hasWork = project.codings.length > 0 || project.documents.length > 0 || project.codes.length > 0;
  const updatedAt = Date.parse(project.project.updatedAt) || 0;
  const exportedAt = lastExportedAt ? Date.parse(lastExportedAt) : 0;
  const unexported = updatedAt > exportedAt; // changed since the last download (or never exported)
  const since = Math.max(exportedAt, snoozedAt, sessionStart);
  if (!hasWork || !unexported || now - since < REMIND_MS) return null;

  return html`
    <div class="backup-hint" role="status">
      <span class="bh-text">Your work lives in this browser only. <strong>Export a backup?</strong></span>
      <button class="bh-go" onClick=${() => actions.exportProject()}>Export</button>
      <button class="ghost bh-later" title="remind me later" onClick=${() => setSnoozedAt(Date.now())}>Later</button>
    </div>`;
}

function App() {
  const state = useStore();
  const { project, ui, settings } = state;
  const [toolbar, setToolbar] = useState(null);
  const [popover, setPopover] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);

  useEffect(() => { registerToolbar(setToolbar); registerPopover(setPopover); openPasteSetter = setPasteOpen; }, []);

  // Keyboard: apply most-recently-used code to the current selection (section 8).
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if ((e.key === "a" || e.key === "A") && (e.metaKey || e.ctrlKey) === false) {
        const sel = window.__openqualSelection;
        if (sel && ui.mruCodeId) { e.preventDefault(); actions.applyCode(sel, ui.mruCodeId); setToolbar(null); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui.mruCodeId]);

  return html`
    <div class="app ${ui.hidePanels ? "focus" : ""}">
      <${TopBar} project=${project} ui=${ui} settings=${settings} />
      <main class="columns">
        ${!ui.hidePanels ? html`<aside class="col-left"><${CodeTree} project=${project} ui=${ui} /></aside>` : null}
        <section class="col-centre">
          ${ui.view === "distribution"
            ? html`<${Distribution} project=${project} />`
            : html`<${TranscriptView} project=${project} ui=${ui} />`}
        </section>
        ${!ui.hidePanels ? html`<aside class="col-right"><${ContextPanel} project=${project} ui=${ui} /></aside>` : null}
      </main>

      <${SelectionToolbar} data=${toolbar} project=${project} onClose=${() => setToolbar(null)} />
      <${SpanPopover} data=${popover} project=${project} onClose=${() => setPopover(null)} />
      <${PasteModal} open=${pasteOpen} onClose=${() => setPasteOpen(false)} />
      ${ui.settingsOpen ? html`<${Settings} settings=${settings} onClose=${() => actions.closeSettings()} />` : null}
      <${BackupHint} />
    </div>`;
}

render(html`<${App} />`, document.getElementById("app"));
