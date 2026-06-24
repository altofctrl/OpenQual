// model/remap.js
// Diff an old segment text against new text and remap the segment's codings/comments
// (section 5). Dependency-free: a common-prefix / common-suffix diff yields a single
// {position, removed, inserted} edit op, which is sufficient for typical in-place
// segment edits. Spans deleted entirely are flagged orphaned, not dropped.

// Compute the minimal middle edit between two strings.
// Returns { position, removed, inserted } where `removed`/`inserted` are lengths.
export function diffSegment(oldText, newText) {
  const oldLen = oldText.length;
  const newLen = newText.length;
  let prefix = 0;
  const maxPrefix = Math.min(oldLen, newLen);
  while (prefix < maxPrefix && oldText[prefix] === newText[prefix]) prefix++;

  let suffix = 0;
  const maxSuffix = Math.min(oldLen, newLen) - prefix;
  while (suffix < maxSuffix && oldText[oldLen - 1 - suffix] === newText[newLen - 1 - suffix]) suffix++;

  const removed = oldLen - prefix - suffix; // chars removed from old in the middle
  const inserted = newLen - prefix - suffix; // chars inserted into new in the middle
  return { position: prefix, removed, inserted };
}

// Remap a single {start, length} anchor through one edit op.
// Returns { start, length, orphaned }.
export function remapAnchor(anchor, edit) {
  const { position, removed, inserted } = edit;
  const delta = inserted - removed;
  const editStart = position;
  const editEnd = position + removed; // exclusive, in OLD coordinates
  const spanStart = anchor.start;
  const spanEnd = anchor.start + anchor.length; // exclusive, in OLD coordinates

  // Edit entirely after the span: span unchanged.
  if (editStart >= spanEnd) {
    return { start: spanStart, length: anchor.length, orphaned: false };
  }
  // Edit entirely before the span: shift start by delta.
  if (editEnd <= spanStart) {
    return { start: spanStart + delta, length: anchor.length, orphaned: false };
  }
  // Edit overlaps the span. Recompute the surviving portion of the span.
  // Old-span chars that fall strictly before the edit survive at the head.
  const headKept = Math.max(0, editStart - spanStart);
  // Old-span chars that fall strictly after the edit survive at the tail.
  const tailKept = Math.max(0, spanEnd - editEnd);
  // Did the edit insert text inside the span's interior? If the edit region sits
  // wholly within the span, the inserted text is considered part of the span.
  const editInsideSpan = editStart >= spanStart && editEnd <= spanEnd;
  const insertedKept = editInsideSpan ? inserted : 0;

  const newLength = headKept + insertedKept + tailKept;
  if (newLength <= 0) {
    // The whole coded span was deleted: orphan it (section 5, step 2/3).
    return { start: Math.min(spanStart, editStart), length: 0, orphaned: true };
  }
  const newStart = spanStart <= editStart ? spanStart : spanStart + delta;
  return { start: Math.max(0, newStart), length: newLength, orphaned: false };
}

// Remap every coding/comment anchored to `segmentId` after its text changed.
// Mutates copies and returns { codings, comments, orphans:[] } where orphans is the
// list of original anchor records (codings/comments) whose span was deleted.
export function remapSegment(project, segmentId, oldText, newText) {
  if (oldText === newText) return { codings: project.codings, comments: project.comments, orphans: [] };
  const edit = diffSegment(oldText, newText);
  const orphans = [];

  const remapList = (list) =>
    list.map((item) => {
      if (item.segmentId !== segmentId) return item;
      const r = remapAnchor(item, edit);
      if (r.orphaned) {
        orphans.push({ ...item, _orphanedAt: new Date().toISOString(), _oldText: oldText.slice(item.start, item.start + item.length) });
        return null;
      }
      return { ...item, start: r.start, length: r.length };
    }).filter(Boolean);

  return { codings: remapList(project.codings), comments: remapList(project.comments), orphans };
}
