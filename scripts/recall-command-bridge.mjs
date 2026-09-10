import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runClaude, runCustom } from './agent-adapters.mjs';
import { handleHarvestRequest, shutdownHarvest } from './recall-harvest.mjs';

const HOST = '127.0.0.1';
const PORT = Number(process.env.RECALL_BRIDGE_PORT ?? 8787);
const TOKEN = process.env.RECALL_BRIDGE_TOKEN;
const UI_ORIGIN = process.env.RECALL_UI_ORIGIN ?? 'http://127.0.0.1:5173';
const KIND = process.env.RECALL_AGENT_KIND;
const MAX_BODY_BYTES = 1_000_000;
const MAX_PROMPT_CHARS = 250_000;
const WORKSPACE = join(tmpdir(), 'recall-agent-readonly');

if (!TOKEN || TOKEN.length < 32) throw new Error('RECALL_BRIDGE_TOKEN must be a random secret of at least 32 characters.');
if (KIND !== 'claude' && KIND !== 'custom') throw new Error('RECALL_AGENT_KIND must be claude or custom.');
await mkdir(WORKSPACE, { recursive: true });

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function rejectUnsafePost(request, response) {
  if (request.method !== 'POST') return false;
  if (request.headers.origin !== UI_ORIGIN) {
    json(response, 403, { error: 'Request origin was rejected.' });
    return true;
  }
  if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    json(response, 415, { error: 'Content-Type must be application/json.' });
    return true;
  }
  return false;
}

async function readPrompt(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
  if (typeof body.system !== 'string' || typeof body.user !== 'string' || !body.system.trim() || !body.user.trim()) {
    throw Object.assign(new Error('system and user must be non-empty strings.'), { status: 400 });
  }
  if (body.system.length + body.user.length > MAX_PROMPT_CHARS) {
    throw Object.assign(new Error('Prompt is too large.'), { status: 413 });
  }
  return { system: body.system, user: body.user, maxTokens: Number(body.maxTokens) || 4096 };
}

let completionTail = Promise.resolve();
function queueCompletion(prompt) {
  const run = completionTail.then(() => KIND === 'claude' ? runClaude(prompt, WORKSPACE) : runCustom(prompt, WORKSPACE));
  completionTail = run.catch(() => {});
  return run;
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') return json(response, 200, { ok: true, mode: KIND });
  if (rejectUnsafePost(request, response)) return;
  if (request.url?.startsWith('/api/recall-harvest')) {
    if (request.headers['x-recall-bridge-token'] !== TOKEN) return json(response, 401, { error: 'Unauthorized local request.' });
    return handleHarvestRequest(request, response);
  }
  if (request.method !== 'POST' || request.url !== '/api/recall-agent/complete') return json(response, 404, { error: 'Not found.' });
  if (request.headers['x-recall-bridge-token'] !== TOKEN) return json(response, 401, { error: 'Unauthorized local request.' });
  try {
    const text = await queueCompletion(await readPrompt(request));
    return json(response, 200, { text });
  } catch (error) {
    return json(response, Number(error?.status) || 502, {
      error: error instanceof Error ? error.message.slice(0, 500) : 'Local agent request failed.',
    });
  }
});

server.listen(PORT, HOST, () => console.log(`Recall ${KIND} companion listening on http://${HOST}:${PORT}`));
function shutdown() {
  shutdownHarvest();
  server.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
