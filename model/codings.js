// model/codings.js
// Apply / remove / query codings, and the overlap breakpoint builder used by the
// transcript renderer (section 6). Offsets are UTF-16 code-unit indices into
// segment.text, the same units as String.prototype.slice and DOM Range (section 4).

import { uid } from "./schema.js";

export function makeCoding(documentId, segmentId, start, length, codeId) {
  return { id: uid("cd"), documentId, segmentId, start, length, codeId, createdAt: new Date().toISOString() };
}

export function makeComment(documentId, segmentId, start, length, text = "") {
  return { id: uid("cm"), documentId, segmentId, start, length, text };
}

export function codingsForSegment(project, segmentId) {
  return project.codings.filter((c) => c.segmentId === segmentId);
}

export function commentsForSegment(project, segmentId) {
  return project.comments.filter((c) => c.segmentId === segmentId);
}

// True if a coding for (segmentId, start, length, codeId) already exists — used to
// avoid duplicate codings when the same code is applied twice to an identical span.
export function hasCoding(project, segmentId, start, length, codeId) {
  return project.codings.some(
    (c) => c.segmentId === segmentId && c.start === start && c.length === length && c.codeId === codeId,
  );
}

// Build non-overlapping render spans for one segment (section 6).
// Returns [{ start, end, codeIds:[], commentIds:[] }] covering [0, textLength).
// Each piece carries the set of codes/comments whose range covers it, so the
// renderer never nests background fills.
export function buildBreakpoints(textLength, codings, comments) {
  const points = new Set([0, textLength]);
  for (const c of codings) {
    points.add(clamp(c.start, 0, textLength));
    points.add(clamp(c.start + c.length, 0, textLength));
  }
  for (const c of comments) {
    points.add(clamp(c.start, 0, textLength));
    points.add(clamp(c.start + c.length, 0, textLength));
  }
  const sorted = [...points].sort((a, b) => a - b);
  const pieces = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end <= start) continue;
    const codeIds = codings.filter((c) => covers(c, start, end)).map((c) => c.codeId);
    const codingIds = codings.filter((c) => covers(c, start, end)).map((c) => c.id);
    const commentIds = comments.filter((c) => covers(c, start, end)).map((c) => c.id);
    pieces.push({ start, end, codeIds: dedupe(codeIds), codingIds, commentIds });
  }
  return pieces;
}

function covers(c, start, end) {
  return c.start <= start && c.start + c.length >= end && c.length > 0;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dedupe(a) { return [...new Set(a)]; }

// Code-frequency and co-occurrence summaries (simple counts only — non-goal §2 caps
// us at this). Used by the optional distribution view.
export function codeFrequency(project) {
  const freq = {};
  for (const c of project.codings) freq[c.codeId] = (freq[c.codeId] || 0) + 1;
  return freq;
}
