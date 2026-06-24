// ingest/source.js
// The single ingest interface. Every source (VTT, pasted text, audio) converges on
// one normalised Document with segments[] (section 7). New sources implement
// `ingest(input, source) -> Document` and register here.

import { uid } from "../model/schema.js";

// Wrap raw segments (speaker/text/tStart/tEnd) into a Document with stable ids.
export function buildDocument(title, sourceType, rawSegments, mediaRef = null) {
  return {
    id: uid("doc"),
    title,
    source: { type: sourceType, mediaRef },
    segments: rawSegments.map((s) => ({
      id: uid("s"),
      speaker: s.speaker || "Unknown",
      tStart: typeof s.tStart === "number" ? s.tStart : null,
      tEnd: typeof s.tEnd === "number" ? s.tEnd : null,
      text: s.text || "",
    })),
  };
}

// Merge consecutive raw segments from the same speaker into one turn (shared by the
// VTT parser and the audio word→turn merger, section 7A/7C).
export function mergeConsecutiveSpeaker(rawSegments) {
  const merged = [];
  for (const seg of rawSegments) {
    const last = merged[merged.length - 1];
    if (last && last.speaker === seg.speaker) {
      last.text = `${last.text} ${seg.text}`.trim();
      last.tEnd = seg.tEnd ?? last.tEnd;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}
