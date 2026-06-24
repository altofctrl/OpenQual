// ui/Settings.js
// Settings panel: API keys + providers (section 9). Keys are stored in the browser
// ONLY (localStorage or sessionStorage per the chosen scope) and never written into
// the project JSON. Providers are swappable: a provider type is stored alongside each
// key so an OpenAI-compatible local model can be pointed at instead. The plain warning
// about browser-held keys / CORS is shown here per the brief.

import { html, useState } from "./h.js";
import { actions } from "../store.js";

export function Settings({ settings, onClose }) {
  const [s, setS] = useState(JSON.parse(JSON.stringify(settings)));
  const set = (path, value) => {
    const next = { ...s };
    let o = next;
    const parts = path.split(".");
    for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = { ...o[parts[i]] }; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = value;
    setS(next);
  };

  return html`
    <div class="modal-backdrop" onMouseDown=${onClose}>
      <div class="modal" onMouseDown=${(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <div class="warn">
          <b>Browser-held keys.</b> Keys are stored in this browser only and are visible to anyone with access
          to this machine. Direct browser calls to a provider expose the key to that provider's origin and may be
          blocked by CORS. A thin server proxy is the production-safe pattern (left out on purpose; see README).
        </div>

        <label class="ctx-label">Secret storage scope</label>
        <select value=${s.scope} onChange=${(e) => set("scope", e.target.value)}>
          <option value="session">sessionStorage — cleared when the tab closes (safer, default)</option>
          <option value="local">localStorage — persists across sessions</option>
        </select>

        <fieldset>
          <legend>Text normaliser (pasted-text path)</legend>
          <label class="ctx-label">Provider</label>
          <select value=${s.llm.provider} onChange=${(e) => set("llm.provider", e.target.value)}>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI-compatible (incl. local models)</option>
          </select>
          <label class="ctx-label">Model</label>
          <input value=${s.llm.model} placeholder=${s.llm.provider === "anthropic" ? "claude-haiku-4-5" : "gpt-4o-mini"}
            onInput=${(e) => set("llm.model", e.target.value)} />
          <label class="ctx-label">Endpoint (optional — overrides default)</label>
          <input value=${s.llm.endpoint} placeholder=${s.llm.provider === "anthropic" ? "https://api.anthropic.com/v1/messages" : "https://api.openai.com/v1/chat/completions"}
            onInput=${(e) => set("llm.endpoint", e.target.value)} />
          <label class="ctx-label">API key</label>
          <input type="password" value=${s.llm.key} autocomplete="off"
            onInput=${(e) => set("llm.key", e.target.value)} />
        </fieldset>

        <fieldset class="muted">
          <legend>Audio (later milestone)</legend>
          <label class="ctx-label">Whisper / transcription endpoint + key</label>
          <input value=${s.whisper.endpoint} placeholder="https://api.openai.com/v1/audio/transcriptions"
            onInput=${(e) => set("whisper.endpoint", e.target.value)} />
          <input type="password" value=${s.whisper.key} autocomplete="off" placeholder="transcription key"
            onInput=${(e) => set("whisper.key", e.target.value)} />
          <label class="ctx-label">Picovoice access key (in-browser diarisation)</label>
          <input type="password" value=${s.picovoice.accessKey} autocomplete="off"
            onInput=${(e) => set("picovoice.accessKey", e.target.value)} />
        </fieldset>

        <div class="modal-actions">
          <button onClick=${() => actions.saveSettings(s)}>Save</button>
          <button class="ghost" onClick=${onClose}>Cancel</button>
        </div>
      </div>
    </div>`;
}
