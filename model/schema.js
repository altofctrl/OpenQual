// model/schema.js
// Validation of the project JSON (section 4 of the brief) and the LLM segment contract.
// Validation is intentionally lightweight: enough to catch malformed imports and bad
// LLM output, not a full JSON-Schema engine (keeps the no-build constraint honest).

export const SCHEMA_VERSION = "1.0";
export const APP_VERSION = "0.1.0";

function isStr(v) { return typeof v === "string"; }
function isNum(v) { return typeof v === "number" && !Number.isNaN(v); }
function isNumOrNull(v) { return v === null || isNum(v); }

// Validate a full project document. Returns { ok, errors:[] }.
export function validateProject(p) {
  const errors = [];
  if (!p || typeof p !== "object") return { ok: false, errors: ["project is not an object"] };
  if (p.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be "${SCHEMA_VERSION}"`);
  if (!p.project || !isStr(p.project.id)) errors.push("project.id missing");
  if (!Array.isArray(p.documents)) errors.push("documents must be an array");
  if (!Array.isArray(p.codes)) errors.push("codes must be an array");
  if (!Array.isArray(p.codings)) errors.push("codings must be an array");
  if (!Array.isArray(p.comments)) errors.push("comments must be an array");

  for (const d of p.documents || []) {
    if (!isStr(d.id)) errors.push("document.id missing");
    if (!Array.isArray(d.segments)) errors.push(`document ${d.id} segments not an array`);
    for (const s of d.segments || []) {
      if (!isStr(s.id)) errors.push(`segment in ${d.id} missing id`);
      if (!isStr(s.text)) errors.push(`segment ${s.id} text not a string`);
    }
  }
  for (const c of p.codes || []) {
    if (!isStr(c.id) || !isStr(c.name)) errors.push("code missing id/name");
  }
  for (const cd of p.codings || []) {
    if (!isStr(cd.id) || !isStr(cd.segmentId) || !isStr(cd.codeId)) errors.push("coding missing refs");
    if (!isNum(cd.start) || !isNum(cd.length)) errors.push(`coding ${cd.id} bad offsets`);
  }
  return { ok: errors.length === 0, errors };
}

// Validate the LLM segment contract (section 7B):
//   { segments: [ { speaker, text, tStart:number|null, tEnd:number|null } ] }
// Returns { ok, errors:[], segments:[] } with normalised segment objects on success.
export function validateLlmSegments(obj) {
  const errors = [];
  if (!obj || !Array.isArray(obj.segments)) {
    return { ok: false, errors: ["expected { segments: [...] }"], segments: [] };
  }
  const segments = [];
  obj.segments.forEach((s, i) => {
    if (!s || typeof s !== "object") { errors.push(`segments[${i}] not an object`); return; }
    if (!isStr(s.speaker)) errors.push(`segments[${i}].speaker must be a string`);
    if (!isStr(s.text)) errors.push(`segments[${i}].text must be a string`);
    if (!isNumOrNull(s.tStart ?? null)) errors.push(`segments[${i}].tStart must be number|null`);
    if (!isNumOrNull(s.tEnd ?? null)) errors.push(`segments[${i}].tEnd must be number|null`);
    segments.push({
      speaker: isStr(s.speaker) ? s.speaker : "Unknown",
      text: isStr(s.text) ? s.text : "",
      tStart: isNum(s.tStart) ? s.tStart : null,
      tEnd: isNum(s.tEnd) ? s.tEnd : null,
    });
  });
  return { ok: errors.length === 0, errors, segments };
}

let _seq = 0;
// Short, collision-resistant ids without a dependency.
export function uid(prefix) {
  _seq += 1;
  return `${prefix}_${Date.now().toString(36)}${_seq.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function emptyProject(title = "Untitled project") {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    project: { id: uid("p"), title, createdAt: now, updatedAt: now, appVersion: APP_VERSION },
    documents: [],
    codes: [],
    codings: [],
    comments: [],
    // Orphaned codings whose anchored span was deleted during an edit (section 5).
    unanchored: [],
  };
}
