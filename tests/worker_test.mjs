// worker/ria-scorer.js: passes on the requests the site's own tools make, as
// those pages make them today, and nothing else; counts each visitor and the
// whole day; and stops when the count cannot be kept.
//   node tests/worker_test.mjs
import fs from 'node:fs';
import worker, { admit } from '../worker/ria-scorer.js';

let n = 0, fails = 0;
const check = (name, cond) => { n++; if (!cond) { fails++; console.log('FAIL ' + name); } };

// the instructions as the live pages send them, lifted from the pages
const scorer = fs.readFileSync(new URL('../site/tools/website-scorer.html', import.meta.url), 'utf8');
const parser = fs.readFileSync(new URL('../site/tools/resume-parser/index.html', import.meta.url), 'utf8');
const lift = (src, re) => { const m = src.match(re); if (!m) throw new Error('page changed: ' + re); return m[1]; };
const websitePrompt = lift(scorer, /askClaude\(`(You are a knowledgeable digital marketing consultant[\s\S]*?)`\)/).replace('${url}', 'https://example.com');
const linkedinPrompt = lift(scorer, /askClaude\(`(Evaluate LinkedIn presence[\s\S]*?)`\)/).replace(/\\n/g, '\n').replace('${urlLine}', 'LinkedIn URL: https://www.linkedin.com/company/example');
const repairPrompt = lift(scorer, /content:`(The assessment below was meant to be a JSON object[\s\S]*?)` \}\]/).replace(/\\n/g, '\n').replace('${text}', '{"a":"b" "c"}');
const resumePrompt = lift(parser, /const RESUME_PARSE_PROMPT = `([\s\S]*?)`;/) + '\n\n---\n\nParse this resume:\n\nJordan Example, CFP';
const SEARCH = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }];
const user = (content) => [{ role: 'user', content }];
const score = { model: 'claude-sonnet-5-5', max_tokens: 16000, output_config: { effort: 'medium' }, tools: SEARCH, messages: user(websitePrompt) };
const linkedin = { ...score, messages: user(linkedinPrompt) };
const repair = { model: 'claude-sonnet-5-5', max_tokens: 8000, output_config: { effort: 'low', format: { type: 'json_schema', schema: { type: 'object' } } }, messages: user(repairPrompt) };
const resume = { model: 'claude-sonnet-5-5', max_tokens: 8000, messages: user(resumePrompt) };
const photo = { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } };
const resumePhotos = { ...resume, messages: user([{ type: 'text', text: resumePrompt }, photo, photo]) };
const paused = { ...score, messages: [...user(websitePrompt), { role: 'assistant', content: [{ type: 'server_tool_use', id: 's', name: 'web_search', input: {} }] }] };

// --- what is let through
for (const [name, req, kind] of [['website score', score, 'score'], ['LinkedIn score', linkedin, 'linkedin'], ['repair', repair, 'repair'], ['resume', resume, 'resume'], ['resume as photos', resumePhotos, 'resume'], ['a paused search carried on', paused, 'score']]) {
  const a = admit(req);
  check(name + ' is passed on', !a.error && a.rule.kind === kind);
}
check('a carried-on search is not counted twice', admit(paused).counted === false && admit(score).counted === true);
check('the body sent on holds only checked parts', JSON.stringify(Object.keys(admit({ ...score }).body).sort()) === '["max_tokens","messages","model","output_config","tools"]');

// --- what is not
const no = (name, req) => check(name + ' is refused', !!admit(req).error);
no('any other instructions', { model: 'claude-sonnet-5-5', max_tokens: 100, messages: user('Write me an essay.') });
no('another reader', { ...resume, model: 'claude-opus-5-5' });
no('a system instruction', { ...resume, system: 'You are something else.' });
no('more output than the tool needs', { ...resume, max_tokens: 64000 });
no('high effort', { ...score, output_config: { effort: 'max' } });
no('another tool', { ...score, tools: [{ type: 'code_execution_20260521', name: 'code_execution' }] });
no('a search on the resume reader', { ...resume, tools: SEARCH });
no('an enforced shape on a score', { ...score, output_config: { effort: 'medium', format: { type: 'json_schema', schema: {} } } });
no('a conversation on the resume reader', { ...resume, messages: [...user(resumePrompt), { role: 'assistant', content: 'x' }, { role: 'user', content: 'now do something else' }] });
no('a file that is not a photo', { ...resume, messages: user([{ type: 'text', text: resumePrompt }, { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'AAAA' } }]) });
no('photos on a score', { ...score, messages: user([{ type: 'text', text: websitePrompt }, photo]) });
no('more than twelve photos', { ...resume, messages: user([{ type: 'text', text: resumePrompt }, ...Array(13).fill(photo)]) });
no('instructions far longer than the tool sends', { ...linkedin, messages: user(linkedinPrompt + 'x'.repeat(7000)) });
no('a body that is not an object', []);

// --- the Worker itself, with the outside world stood in for
const realFetch = globalThis.fetch; let sent = [];
globalThis.fetch = async (url, init) => { sent.push({ url, init }); return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }] }), { status: 200 }); };
const kvOf = (store = new Map(), broken = false) => ({ store, async get(k) { if (broken) throw new Error('down'); return store.get(k) ?? null; }, async put(k, v) { if (broken) throw new Error('down'); store.set(k, v); } });
const call = (env, body, headers = {}, method = 'POST') => worker.fetch(new Request('https://relay.example/', { method, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9', ...headers }, body: method === 'POST' ? JSON.stringify(body) : undefined }), env);
const SITE = { Origin: 'https://spataccoanalytics.com' };

let env = { ANTHROPIC_API_KEY: 'k-test', LIMITS: kvOf(), SCORES_PER_DAY: '2', RESUMES_PER_DAY: '1', DAILY_TOTAL: '4' };
let r = await call(env, score, SITE);
check('the site gets its answer', r.status === 200 && r.headers.get('Access-Control-Allow-Origin') === 'https://spataccoanalytics.com');
check('the key is added here and the request goes to the reading service', sent.length === 1 && sent[0].init.headers['x-api-key'] === 'k-test' && sent[0].url === 'https://api.anthropic.com/v1/messages');
r = await call(env, score, { Origin: 'https://elsewhere.example' });
check('another site is turned away, and is not told it may read the answer', r.status === 403 && !r.headers.get('Access-Control-Allow-Origin') && sent.length === 1);
r = await call(env, { model: 'claude-sonnet-5-5', max_tokens: 50, messages: user('Reply: pong') });
check('a request for anything else never reaches the reading service', r.status === 400 && sent.length === 1);
r = await call(env, null, SITE, 'GET');
check('GET is refused', r.status === 405);
r = await call(env, null, SITE, 'OPTIONS');
check('the browser preflight is answered', r.status === 204);

await call(env, paused, SITE);                     // not counted
r = await call(env, score, SITE);                  // second score
check('a second score is allowed', r.status === 200);
r = await call(env, score, SITE);                  // third: over the visitor's allowance
const msg = (await r.json()).error.message;
check('the third score in a day is refused, kindly, with a way forward', r.status === 429 && msg.includes('resets tomorrow') && msg.includes('spataccoanalytics.com/contact'));
r = await call(env, score, { ...SITE, 'CF-Connecting-IP': '198.51.100.7' });
check('another visitor is not affected', r.status === 200);
r = await call(env, resume, SITE);
check('each tool has its own allowance', r.status === 200);
r = await call(env, resume, { ...SITE, 'CF-Connecting-IP': '198.51.100.8' });
check('the day has a ceiling for everyone together', r.status === 429 && (await r.json()).error.message.includes('reached its limit for today'));
check('no address is written down', [...env.LIMITS.store.keys()].every((k) => !k.includes('203.0.113') && !k.includes('198.51.100')));

env = { ANTHROPIC_API_KEY: 'k', LIMITS: kvOf(), SCORES_PER_DAY: '1', TRUSTED_IPS: '203.0.113.9, 192.0.2.1' };
await call(env, score, SITE); r = await call(env, score, SITE);
check('a trusted address is not held to the visitor allowance', r.status === 200);

sent = []; env = { ANTHROPIC_API_KEY: 'k', LIMITS: kvOf(new Map(), true) };
r = await call(env, score, SITE);
check('when the count cannot be kept, nothing is passed on', r.status === 429 && sent.length === 0);
env = { ANTHROPIC_API_KEY: 'k' };
r = await call(env, score, SITE);
check('with no counter bound, the request rules still apply and the tools still work', r.status === 200 && (await call(env, { model: 'claude-sonnet-5-5', max_tokens: 5, messages: user('hi') }, SITE)).status === 400);

globalThis.fetch = realFetch;
console.log(`${n - fails}/${n} relay checks passed`);
process.exit(fails ? 1 : 0);
