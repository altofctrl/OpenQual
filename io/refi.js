// io/refi.js
// REFI-QDA export — STUB (section 11, "later"). The standard interchange read by f4,
// MAXQDA, ATLAS.ti, NVivo, Quirkos. Export requires flattening segments into one
// plain-text body per document and converting segment-scoped offsets back to GLOBAL
// offsets over that body. Build ONE serialiser that yields the flat text plus an index
// map from (segmentId, localOffset) -> global offset, and reuse it for REFI and f4
// export. Mind UTF-16 vs Unicode code-point units (section 4).

// Shared flattener: concatenate a document's segments into one body and return an
// index map. This is the reusable core both REFI and f4 export will need.
export function flattenDocument(doc, joiner = "\n") {
  let body = "";
  const map = {}; // segmentId -> base global offset of that segment's text
  doc.segments.forEach((s, i) => {
    map[s.id] = body.length;
    body += s.text;
    if (i < doc.segments.length - 1) body += joiner;
  });
  return { body, map, joiner };
}

export function toGlobalOffset(map, segmentId, localOffset) {
  return (map[segmentId] ?? 0) + localOffset;
}

export function exportRefi() {
  throw new Error("REFI-QDA export is not implemented yet (later milestone, section 11).");
}
