// ingest/audio.js
// Audio ingest STUB behind the source interface (section 7C). The merge logic lives
// here in app code so swapping Whisper or Picovoice later does not change the segment
// builder. Wire transcribe()/diarise() to real providers in a later milestone; the
// heavy WASM/transcription clients must be lazy-loaded only when this path runs
// (section 10), so do the dynamic import() inside the real implementations.

import { buildDocument, mergeConsecutiveSpeaker } from "./source.js";

// Whisper placeholder: words with per-word timings.
// eslint-disable-next-line no-unused-vars
export async function transcribe(audioFile, cfg) {
  throw new Error("Audio transcription is not wired up yet (stub). Coming in the audio milestone.");
  // return { words: [{ text, tStart, tEnd }] };
}

// Picovoice placeholder: diarisation turns. Real impl lazy-loads the WASM bundle.
// eslint-disable-next-line no-unused-vars
export async function diarise(audioFile, cfg) {
  throw new Error("Diarisation is not wired up yet (stub). Coming in the audio milestone.");
  // return { turns: [{ speaker, tStart, tEnd }] };
}

// Assign each word to the diarisation turn whose time range contains its midpoint,
// then group contiguous same-speaker words into segments. This is the stable merge
// the brief wants kept in app code (section 7C). Exported so it is unit-testable now.
export function mergeWordsAndTurns(words, turns) {
  const speakerFor = (mid) => {
    const t = turns.find((x) => x.tStart <= mid && mid <= x.tEnd);
    return t ? t.speaker : "Unknown";
  };
  const raw = words.map((w) => ({
    speaker: speakerFor((w.tStart + w.tEnd) / 2),
    text: w.text,
    tStart: w.tStart,
    tEnd: w.tEnd,
  }));
  // Collapse word-level rows into speaker turns.
  const grouped = [];
  for (const r of raw) {
    const last = grouped[grouped.length - 1];
    if (last && last.speaker === r.speaker) {
      last.text = `${last.text} ${r.text}`.trim();
      last.tEnd = r.tEnd;
    } else {
      grouped.push({ ...r });
    }
  }
  return grouped;
}

export async function ingestAudio(audioFile, cfg, title = "Audio transcript") {
  const [{ words }, { turns }] = await Promise.all([transcribe(audioFile, cfg), diarise(audioFile, cfg)]);
  const merged = mergeConsecutiveSpeaker(mergeWordsAndTurns(words, turns));
  return buildDocument(title, "audio", merged, audioFile?.name || null);
}
