/**
 * Spatacco Analytics: the scoring relay (Cloudflare Worker "ria-scorer").
 *
 * The Website Scorer and the Resume Parser on spataccoanalytics.com send
 * their requests here, and this adds the API key and passes them on. The key
 * never reaches a browser.
 *
 * It is not an open door. A request is passed on only if it is one of the
 * five requests those two tools make, for the one reader they use, within
 * the sizes they need. Each visitor gets a daily allowance per tool, and the
 * whole relay has a daily ceiling, so the most anyone can cost in a day is
 * known in advance.
 *
 * Settings (Worker > Settings > Variables and Secrets):
 *   ANTHROPIC_API_KEY   secret, required
 *   LIMITS              KV namespace binding. Without it the request rules
 *                       still apply but nothing is counted.
 *   SCORES_PER_DAY      per visitor, website and LinkedIn scores each (default 8)
 *   LOOKUPS_PER_DAY     per visitor, a firm's name looked up for its website (default 8)
 *   RESUMES_PER_DAY     per visitor, resume reads (default 4)
 *   DAILY_TOTAL         all visitors together, every kind (default 150)
 *   TRUSTED_IPS         comma-separated addresses that are not counted
 *
 * The source of truth is worker/ria-scorer.js in the site's repository.
 * It is deployed by pasting it into the Worker's editor (worker/README.md).
 */

const ALLOWED_ORIGINS = ["https://spataccoanalytics.com", "https://www.spataccoanalytics.com"];
const MODELS = ["claude-sonnet-5-5"];
const UPSTREAM = "https://api.anthropic.com/v1/messages";
const MAX_BODY_BYTES = 20 * 1024 * 1024; // a resume as up to 12 photos
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const CONTACT = "https://spataccoanalytics.com/contact/";

// The five requests the tools make, told apart by how their instructions begin.
// (searches: the most web searches one request may run, six unless it says fewer.)
const KINDS = [
  { kind: "score", allowance: "SCORES_PER_DAY", search: true, maxTokens: 16000, maxText: 12000,
    starts: "You are a knowledgeable digital marketing consultant helping a financial advisor or RIA" },
  { kind: "linkedin", allowance: "SCORES_PER_DAY", search: true, maxTokens: 16000, maxText: 6000,
    starts: "Evaluate LinkedIn presence for a financial advisory firm." },
  // A firm's name typed into the scorer in place of its website: the sites it could mean.
  // Short, a few searches, and counted apart from the scores so that finding a firm does
  // not use one up.
  { kind: "find", allowance: "LOOKUPS_PER_DAY", search: true, searches: 3, maxTokens: 4000, maxText: 2500,
    starts: "Find the official website of a financial advisory firm from the name a visitor typed." },
  { kind: "repair", allowance: "SCORES_PER_DAY", search: false, maxTokens: 8000, maxText: 40000, format: true,
    starts: "The assessment below was meant to be a JSON object but does not parse." },
  { kind: "resume", allowance: "RESUMES_PER_DAY", search: false, maxTokens: 8000, maxText: 250000, images: 12,
    starts: "You are a resume parser for Spatacco Analytics." },
];
const DEFAULTS = { SCORES_PER_DAY: 8, LOOKUPS_PER_DAY: 8, RESUMES_PER_DAY: 4, DAILY_TOTAL: 150 };

function cors(origin) {
  const h = { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" };
  if (origin && ALLOWED_ORIGINS.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
function answer(status, body, origin) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(origin) } });
}
function refuse(status, type, message, origin) {
  return answer(status, { type: "error", error: { type, message } }, origin);
}
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const onlyKeys = (o, keys) => Object.keys(o).every((k) => keys.includes(k));

// The text a message opens with, whether it is plain words or blocks.
function openingText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content) && isObject(content[0]) && content[0].type === "text" && typeof content[0].text === "string") return content[0].text;
  return "";
}

// Checks the request against the five the tools make. Returns {rule, body}
// with the body rebuilt from the checked parts only, or {error}.
export function admit(input) {
  if (!isObject(input)) return { error: "The request is not in the expected form." };
  if (!onlyKeys(input, ["model", "max_tokens", "messages", "tools", "output_config"])) return { error: "The request carries a setting this relay does not pass on." };
  if (!MODELS.includes(input.model)) return { error: "This relay does not serve that reader." };
  const messages = input.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 9) return { error: "The request is not in the expected form." };
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!isObject(m) || !onlyKeys(m, ["role", "content"]) || m.role !== (i % 2 === 0 ? "user" : "assistant")) return { error: "The request is not in the expected form." };
  }
  const first = messages[0].content;
  const text = openingText(first);
  const rule = KINDS.find((k) => text.startsWith(k.starts));
  if (!rule) return { error: "This relay only serves the Spatacco Analytics tools." };
  if (text.length > rule.maxText) return { error: "That is too long for this tool." };

  if (!Number.isInteger(input.max_tokens) || input.max_tokens < 1 || input.max_tokens > rule.maxTokens) return { error: "The request asks for more than this tool needs." };

  // what the first message may hold besides its words
  if (Array.isArray(first)) {
    const rest = first.slice(1);
    if (!rule.images || rest.length > rule.images) return { error: "The request is not in the expected form." };
    for (const b of rest) {
      const s = isObject(b) && b.type === "image" && isObject(b.source) ? b.source : null;
      if (!s || s.type !== "base64" || !IMAGE_TYPES.includes(s.media_type) || typeof s.data !== "string") return { error: "Only photos of the pages can be sent with a resume." };
    }
  }
  // a search that paused partway is carried on; nothing else continues
  if (messages.length > 1 && !rule.search) return { error: "The request is not in the expected form." };

  const body = { model: input.model, max_tokens: input.max_tokens, messages };
  if (rule.search) {
    const t = input.tools;
    if (!Array.isArray(t) || t.length !== 1 || !isObject(t[0]) || t[0].type !== "web_search_20260209" || t[0].name !== "web_search") return { error: "The request is not in the expected form." };
    const most = rule.searches || 6;
    const uses = Number.isInteger(t[0].max_uses) ? Math.min(most, Math.max(1, t[0].max_uses)) : most;
    body.tools = [{ type: "web_search_20260209", name: "web_search", max_uses: uses }];
  } else if (input.tools !== undefined) {
    return { error: "The request is not in the expected form." };
  }
  if (input.output_config !== undefined) {
    const oc = input.output_config;
    if (!isObject(oc) || !onlyKeys(oc, ["effort", "format"])) return { error: "The request is not in the expected form." };
    const out = {};
    if (oc.effort !== undefined) {
      if (!["low", "medium"].includes(oc.effort)) return { error: "The request asks for more than this tool needs." };
      out.effort = oc.effort;
    }
    if (oc.format !== undefined) {
      if (!rule.format || !isObject(oc.format) || oc.format.type !== "json_schema" || !isObject(oc.format.schema)) return { error: "The request is not in the expected form." };
      out.format = { type: "json_schema", schema: oc.format.schema };
    }
    body.output_config = out;
  }
  // only the first request of a score or a read is counted, not a carried-on search
  return { rule, body, counted: messages.length === 1 };
}

async function sha(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const setting = (env, name) => { const n = parseInt(env[name], 10); return Number.isFinite(n) && n >= 0 ? n : DEFAULTS[name]; };

// Counts one use against the visitor's allowance and the day's ceiling.
// Returns null when it may go ahead, or the words to refuse it with.
export async function allow(env, rule, ip) {
  const kv = env.LIMITS;
  if (!kv) return null;
  const day = new Date().toISOString().slice(0, 10);
  const trusted = String(env.TRUSTED_IPS || "").split(",").map((s) => s.trim()).filter(Boolean).includes(ip);
  const mine = "v:" + day + ":" + rule.allowance + ":" + (await sha(day + "|" + ip));
  const all = "t:" + day;
  try {
    const [a, b] = await Promise.all([kv.get(mine), kv.get(all)]);
    const used = parseInt(a || "0", 10) || 0, total = parseInt(b || "0", 10) || 0;
    if (total >= setting(env, "DAILY_TOTAL")) {
      return "This tool has reached its limit for today. It is back tomorrow. To have it run for you now, write to us: " + CONTACT;
    }
    if (!trusted && used >= setting(env, rule.allowance)) {
      return "You have reached today's free limit for this tool. It resets tomorrow. If you would like more, write to us: " + CONTACT;
    }
    const keep = { expirationTtl: 60 * 60 * 48 };
    await Promise.all([trusted ? null : kv.put(mine, String(used + 1), keep), kv.put(all, String(total + 1), keep)]);
    return null;
  } catch (e) {
    // If the counter cannot be read or written, nothing is passed on: an
    // uncounted relay is the open door this exists to close.
    return "This tool is resting for a moment. Please try again shortly, or write to us: " + CONTACT;
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== "POST") return refuse(405, "invalid_request_error", "POST only.", origin);
    // A browser on another site says where it is from, and is turned away.
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return refuse(403, "permission_error", "This relay only serves spataccoanalytics.com.", null);
    if (Number(request.headers.get("Content-Length") || 0) > MAX_BODY_BYTES) return refuse(413, "request_too_large", "That is too large for this tool.", origin);

    let input;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) return refuse(413, "request_too_large", "That is too large for this tool.", origin);
      input = JSON.parse(raw);
    } catch {
      return refuse(400, "invalid_request_error", "The request is not in the expected form.", origin);
    }
    const ok = admit(input);
    if (ok.error) return refuse(400, "invalid_request_error", ok.error, origin);

    if (ok.counted) {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const no = await allow(env, ok.rule, ip);
      if (no) return refuse(429, "rate_limit_error", no, origin);
    }

    try {
      const upstream = await fetch(UPSTREAM, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(ok.body),
      });
      const data = await upstream.text();
      return new Response(data, { status: upstream.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(origin) } });
    } catch (err) {
      return refuse(502, "api_error", "The reading service could not be reached. Please try again.", origin);
    }
  },
};
