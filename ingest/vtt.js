// ingest/vtt.js
// Teams WebVTT parser (section 7A). No LLM needed. Teams carries the speaker in a
// <v Speaker Name> voice tag inside each cue. Consecutive cues from the same speaker
// are merged into one turn so segments map to speaker turns, not caption fragments.

import { buildDocument, mergeConsecutiveSpeaker } from "./source.js";

// "00:01:02.500" or "01:02.500" -> seconds
function parseTimestamp(ts) {
  const parts = ts.trim().split(":");
  let h = 0, m = 0, s = 0;
  if (parts.length === 3) { [h, m, s] = parts; }
  else if (parts.length === 2) { [m, s] = parts; }
  else { s = parts[0]; }
  return Number(h) * 3600 + Number(m) * 60 + parseFloat(s);
}

// Pull "<v Speaker Name>text</v>" — Teams form — or fall back to raw text.
function extractVoice(line) {
  const m = line.match(/<v\s+([^>]+)>([\s\S]*?)(?:<\/v>)?$/i);
  if (m) return { speaker: m[1].trim(), text: stripTags(m[2]).trim() };
  return { speaker: null, text: stripTags(line).trim() };
}

function stripTags(s) { return s.replace(/<[^>]+>/g, ""); }

export function parseVtt(vttText, title = "Transcript") {
  const normalised = vttText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalised.split(/\n\n+/);
  const raw = [];
  let lastSpeaker = "Unknown";

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;
    if (/^WEBVTT/i.test(lines[0])) continue; // header

    const timeIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeIdx === -1) continue; // not a cue (e.g. NOTE / STYLE)

    const [startRaw, endRaw] = lines[timeIdx].split("-->");
    const tStart = parseTimestamp(startRaw);
    const tEnd = parseTimestamp(endRaw.split(/\s+/)[0]);

    const textLines = lines.slice(timeIdx + 1);
    let speaker = null;
    const texts = [];
    for (const tl of textLines) {
      const v = extractVoice(tl);
      if (v.speaker) speaker = v.speaker;
      if (v.text) texts.push(v.text);
    }
    if (texts.length === 0) continue;
    if (speaker) lastSpeaker = speaker;
    raw.push({ speaker: speaker || lastSpeaker, text: texts.join(" "), tStart, tEnd });
  }

  return buildDocument(title, "teams_vtt", mergeConsecutiveSpeaker(raw));
}
