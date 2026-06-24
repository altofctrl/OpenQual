// ingest/text-llm.js
// Pasted / unstructured text normaliser (section 7B). Sends raw text to the configured
// small LLM with a strict JSON-only instruction, validates against the segment
// contract, and retries once with the validation error appended before surfacing a
// clear failure (section 7B). Provider is swappable: Anthropic (default) or any
// OpenAI-compatible endpoint (section 9).

import { validateLlmSegments } from "../model/schema.js";
import { buildDocument, mergeConsecutiveSpeaker } from "./source.js";

const SYSTEM = [
  "You convert a raw interview/meeting transcript into structured speaker turns.",
  "Return ONLY a single JSON object, no prose, no code fences, exactly this shape:",
  '{ "segments": [ { "speaker": string, "text": string, "tStart": number|null, "tEnd": number|null } ] }',
  "Group text into turns by speaker. If a timestamp is not present, use null.",
  "Do not invent content. Preserve wording. Do not summarise.",
].join("\n");

function buildUserPrompt(rawText, priorError) {
  let p = `Transcript to structure:\n\n${rawText}`;
  if (priorError) {
    p += `\n\nYour previous response failed validation: ${priorError}\nReturn corrected JSON only.`;
  }
  return p;
}

// Call Anthropic Messages API directly from the browser. Requires the
// anthropic-dangerous-direct-browser-access header to bypass the SDK's browser guard;
// the user is warned in Settings that this exposes the key to the API origin (section 9).
async function callAnthropic(cfg, rawText, priorError) {
  const model = cfg.model || "claude-haiku-4-5";
  const endpoint = cfg.endpoint || "https://api.anthropic.com/v1/messages";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: SYSTEM,
      messages: [{ role: "user", content: buildUserPrompt(rawText, priorError) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).map((b) => b.text || "").join("");
}

// Call any OpenAI-compatible /chat/completions endpoint (also covers local models).
async function callOpenAICompatible(cfg, rawText, priorError) {
  const model = cfg.model || "gpt-4o-mini";
  const endpoint = cfg.endpoint || "https://api.openai.com/v1/chat/completions";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildUserPrompt(rawText, priorError) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`LLM API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// Strip stray code fences if a model ignores the instruction, then JSON.parse.
function parseModelJson(raw) {
  let t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  return JSON.parse(t);
}

async function callProvider(cfg, rawText, priorError) {
  if (cfg.provider === "openai") return callOpenAICompatible(cfg, rawText, priorError);
  return callAnthropic(cfg, rawText, priorError); // default
}

// cfg: { provider: "anthropic"|"openai", endpoint, model, key }
export async function normaliseText(rawText, cfg, title = "Pasted transcript") {
  if (!cfg || !cfg.key) throw new Error("No LLM API key configured. Open Settings and add one.");

  let priorError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callProvider(cfg, rawText, priorError);
    let parsed;
    try {
      parsed = parseModelJson(raw);
    } catch (e) {
      priorError = `not valid JSON: ${e.message}`;
      continue;
    }
    const v = validateLlmSegments(parsed);
    if (v.ok) {
      return buildDocument(title, "pasted_text", mergeConsecutiveSpeaker(v.segments));
    }
    priorError = v.errors.join("; ");
  }
  throw new Error(`LLM normalisation failed validation after retry: ${priorError}`);
}
