# OpenQual

A browser tool for qualitative coding of interview transcripts. It loads a Teams VTT
file or pasted text, lays it out by speaker, and lets you select spans of text, apply a
tree of codes and subcodes, attach comments, edit the transcript with codes staying put,
and export everything as JSON. The workflow follows f4analyse, but it runs entirely in
the browser.

![OpenQual coding an interview transcript: a code tree with frequencies on the left, the speaker-laid-out transcript with coded spans in the centre, and the document list and code memo on the right.](docs/screenshot.png)

## Running it

Open `index.html` over any static server. There is nothing to compile and no install
step; dependencies load from esm.sh at exact pinned versions. 

### From the repo folder, pick one:
```
python3 -m http.server 8000      # then open http://localhost:8000
npx serve                         # Node
php -S localhost:8000
```

Load `sample.vtt` from the
top bar to get a short two-speaker transcript to try.

Hosted copy: https://research.vidalion.co/openqual/

## Your data and backups

Everything is autosaved to your browser's `localStorage` and never leaves your machine.
That also means your work is tied to this one browser: clearing site data, using a
different browser or device, or private-browsing mode will lose it. **Use `Export` from
the top bar to download a `.json` backup** (and `Import` to restore it) — the app shows
an occasional, dismissible reminder to do so. Backups are also how you move a project
between machines. Deploying a new version of the site never touches your stored work.

## What works

- Teams VTT import, and a pasted-text path that sends rough text to an LLM and gets back
  speaker turns. Audio import is stubbed behind the same interface for later.
- A code tree you can create, rename, recolour, nest by dragging, reorder, and delete,
  with a memo on each code.
- Selecting text and applying codes. The same span can carry several codes; overlaps are
  drawn as stacked underlines rather than layered fills, so colours stay readable.
- Comments on a span, kept separate from code memos.
- Editing a turn's text. On save the codings inside that turn are remapped against a diff
  of the change. If an edit deletes a coded span entirely, the coding moves to an
  "unanchored" tray instead of disappearing.
- JSON export and import, plus an autosave to the browser's localStorage.
- A small distribution view: code counts and how often two codes land in the same turn.

## Changelog

### 2026-06-29
- Apply a code by clicking it. Select text in the transcript, then click a code in the
  Codes list to code the selection (the floating toolbar still works too).
- Isolate a code into the side panel. The isolate button (the down arrow on a code) now
  lists that code's passages in the right-hand panel and leaves the transcript in view;
  clicking a passage jumps to its turn. On a phone the list opens in the Notes sheet.
- Drag-and-drop file loading. The empty screen is now a drop area: drag a `.vtt` or `.json`
  onto it, or click it to browse.
- Autosave to a local file. Pick a `.json` once with "Autosave to file" and every change
  is written straight to that file on disk, not just the browser. "Open file" opens an
  existing project and keeps saving back into it. Reopen the site and it reconnects to the
  same file after a one-click permission grant. This uses the browser's File System Access
  API, so it works in Chrome, Edge, and Brave; Firefox and Safari fall back to the usual
  in-browser autosave and the export reminder.
- Work on several transcripts at once. Load more than one and they appear as tabs above
  the transcript; switch between them, or use the toggle to show them side by side. They
  share one set of codes (the usual way to code across interviews) while each transcript
  keeps its own highlights. Each tab has an x to remove that transcript.
- Delete a whole turn from the transcript. Each turn now has a trash button next to the
  edit button; use it to drop turns the speech-to-text got wrong. The codes and comments
  on that turn are removed with it.
- Mobile layout. One column, the transcript fills the screen, and there is no sideways
  scroll. Codes and notes open as bottom sheets from a bottom tab bar, and the top
  toolbar folds into a menu so the bar stays one line.

## How it's put together

```
index.html   entry point
app.js       top bar, layout, keyboard shortcuts, floating toolbar/popover
store.js     state and actions, with a debounced autosave
model/       schema.js (validation), codings.js (overlap breakpoints), remap.js (diff + anchor remap)
ingest/      source.js (the common interface), vtt.js, text-llm.js, audio.js (stub)
ui/          h.js (Preact + htm), TranscriptView, CodeTree, ContextPanel, Settings, Distribution
io/          projectFile.js (JSON), refi.js and f4import.js (stubs for later)
```


## API keys

The pasted-text path needs an LLM key; VTT import does not. Keys are kept in the browser
only, in sessionStorage by default or localStorage if you pick that scope in Settings.
They are never written into the exported or autosaved project file.

The default provider is Anthropic (Claude), and you can point it at any
OpenAI-compatible endpoint instead, including a local model. Calls go straight from the
browser to the provider, which means the key is visible to that origin and the request
can be blocked by CORS. For anything beyond personal use, put the call behind a small
proxy that holds the key and point the endpoint field at it. The proxy is deliberately
not part of this repo.

## Not done yet

Audio import (Whisper plus Picovoice diarisation), seeking an audio element from a
timestamp, REFI-QDA export, f4analyse XML import, and merging two projects. The
interfaces and the offset/flatten helpers these need are stubbed in `ingest/audio.js`,
`io/refi.js`, and `io/f4import.js`.
