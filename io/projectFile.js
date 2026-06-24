// io/projectFile.js
// Native JSON load/save (section 11). Lossless and the primary format. API keys never
// touch this file — they live in web storage only (section 9), so export simply
// serialises the project object as-is (keys are never part of it).

import { validateProject } from "../model/schema.js";

export function serialiseProject(project) {
  const out = { ...project, project: { ...project.project, updatedAt: new Date().toISOString() } };
  return JSON.stringify(out, null, 2);
}

export function downloadProject(project) {
  const blob = new Blob([serialiseProject(project)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (project.project.title || "project").replace(/[^\w.-]+/g, "_");
  a.href = url;
  a.download = `${safe}.openqual.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Parse + validate an uploaded project file. Returns { ok, project, errors }.
export async function loadProjectFromFile(file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, project: null, errors: [`not valid JSON: ${e.message}`] };
  }
  if (!Array.isArray(parsed.unanchored)) parsed.unanchored = []; // tolerate older files
  const v = validateProject(parsed);
  return { ok: v.ok, project: v.ok ? parsed : null, errors: v.errors };
}
