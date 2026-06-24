// io/f4import.js
// f4analyse XML import — STUB (section 11, "later"). Map f4:code (id, name, color,
// parent, pos, memo) -> codes; f4:coding (start, length, code) over the global text ->
// segment-scoped codings by walking the flatten index map (io/refi.js) in reverse;
// f4:comment -> comments.

export function importF4() {
  throw new Error("f4analyse XML import is not implemented yet (later milestone, section 11).");
}

// Reverse of toGlobalOffset: find which segment a global offset falls in and its local
// offset. Provided now so the later importer has the primitive it needs.
export function toLocalOffset(orderedSegments, flatMap, globalOffset) {
  let found = orderedSegments[0];
  for (const s of orderedSegments) {
    if (flatMap[s.id] <= globalOffset) found = s; else break;
  }
  return { segmentId: found.id, localOffset: globalOffset - flatMap[found.id] };
}
