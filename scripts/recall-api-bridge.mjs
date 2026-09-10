import { createServer } from 'node:http';
import { handleHarvestRequest, shutdownHarvest } from './recall-harvest.mjs';

const HOST = '127.0.0.1';
const PORT = Number(process.env.RECALL_BRIDGE_PORT ?? 8787);
const TOKEN = process.env.RECALL_BRIDGE_TOKEN;
const UI_ORIGIN = process.env.RECALL_UI_ORIGIN ?? 'http://127.0.0.1:5173';
const PROVIDER = process.env.RECALL_PROVIDER?.toLowerCase();
const MODEL = process.env.RECALL_MODEL;
const MAX_BODY_BYTES = 1_000_000;
const MAX_PROMPT_CHARS = 250_000;
const REQUEST_TIMEOUT_MS = 180_000;

if (!TOKEN || TOKEN.length < 32) {
  throw new Error('RECALL_BRIDGE_TOKEN must be a random secret of at least 32 characters.');
}
if (PROVIDER !== 'openai' && PROVIDER !== 'anthropic') {
  throw new Error('RECALL_PROVIDER must be either openai or anthropic.');
}
if (!MODEL?.trim()) throw new Error('RECALL_MODEL is required.');
if (PROVIDER === 'openai' && !process.env.OPENAI_API_KEY?.trim()) {
  throw new Error('OPENAI_API_KEY is required when RECALL_PROVIDER=openai.');
}
if (PROVIDER === 'anthropic' && !process.env.ANTHROPIC_API_KEY?.trim()) {
  throw new Error('ANTHROPIC_API_KEY is required when RECALL_PROVIDER=anthropic.');
}

const providerUrl = PROVIDER === 'openai'
  ? new URL('/v1/responses', process.env.RECALL_OPENAI_BASE_URL ?? 'https://api.openai.com')
  : new URL('/v1/messages', process.env.RECALL_ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com');

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function rejectUnsafePost(request, response) {
  if (request.method !== 'POST') return false;
  if (request.headers.origin !== UI_ORIGIN) {
    sendJson(response, 403, { error: 'Request origin was rejected.' });
    return true;
  }
  if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    sendJson(response, 415, { error: 'Content-Type must be application/json.' });
    return true;
  }
  return false;
}

function redactProviderDetail(detail) {
  let safe = detail;
  for (const secret of [process.env.OPENAI_API_KEY, process.env.ANTHROPIC_API_KEY]) {
    if (secret) safe = safe.replaceAll(secret, '[redacted]');
  }
  return safe.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 });
  }
}

function validatePrompt(body) {
  const system = body?.system;
  const user = body?.user;
  if (typeof system !== 'string' || typeof user !== 'string' || !system.trim() || !user.trim()) {
    throw Object.assign(new Error('system and user must be non-empty strings.'), { status: 400 });
  }
  if (system.length + user.length > MAX_PROMPT_CHARS) {
    throw Object.assign(new Error('Prompt is too large.'), { status: 413 });
  }
  const requested = Number(body?.maxTokens ?? 4096);
  const maxTokens = Number.isFinite(requested) ? Math.min(16_384, Math.max(256, Math.floor(requested))) : 4096;
  return { system, user, maxTokens };
}

function providerRequest({ system, user, maxTokens }) {
  if (PROVIDER === 'openai') {
    return {
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: {
        model: MODEL,
        instructions: system,
        input: user,
        max_output_tokens: maxTokens,
        store: false,
        text: { format: { type: 'json_object' } },
      },
    };
  }
  return {
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: {
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    },
  };
}

function extractText(json) {
  if (PROVIDER === 'openai') {
    if (typeof json?.output_text === 'string') return json.output_text;
    return (json?.output ?? [])
      .flatMap((item) => item?.content ?? [])
      .filter((item) => item?.type === 'output_text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join('');
  }
  return (json?.content ?? [])
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('');
}

async function complete(prompt) {
  const request = providerRequest(prompt);
  let providerResponse;
  try {
    providerResponse = await fetch(providerUrl, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error?.name === 'TimeoutError'
      ? 'The provider request timed out.'
      : 'Could not reach the provider.';
    throw Object.assign(new Error(message), { status: 502 });
  }

  if (!providerResponse.ok) {
    const detail = redactProviderDetail(await providerResponse.text().catch(() => '')).slice(0, 500);
    const status = providerResponse.status >= 500 ? 502 : providerResponse.status;
    throw Object.assign(new Error(`Provider returned ${providerResponse.status}.`), { status, detail });
  }

  let json;
  try {
    json = await providerResponse.json();
  } catch {
    throw Object.assign(new Error('Provider returned invalid JSON.'), { status: 502 });
  }
  const text = extractText(json);
  if (!text.trim()) throw Object.assign(new Error('Provider returned an empty response.'), { status: 502 });
  return text;
}

const server = createServer(async (request, response) => {
  response.setHeader('x-content-type-options', 'nosniff');
  if (request.method === 'GET' && request.url === '/health') {
    return sendJson(response, 200, { ok: true, provider: PROVIDER, model: MODEL });
  }
  if (rejectUnsafePost(request, response)) return;
  if (request.url?.startsWith('/api/recall-harvest')) {
    if (request.headers['x-recall-bridge-token'] !== TOKEN) {
      return sendJson(response, 401, { error: 'Unauthorized.' });
    }
    return handleHarvestRequest(request, response);
  }
  if (request.method !== 'POST' || request.url !== '/api/recall-agent/complete') {
    return sendJson(response, 404, { error: 'Not found.' });
  }
  if (request.headers['x-recall-bridge-token'] !== TOKEN) {
    return sendJson(response, 401, { error: 'Unauthorized.' });
  }

  try {
    const prompt = validatePrompt(await readJson(request));
    sendJson(response, 200, { text: await complete(prompt) });
  } catch (error) {
    sendJson(response, Number(error?.status) || 500, {
      error: error instanceof Error ? error.message : 'Request failed.',
      ...(typeof error?.detail === 'string' && error.detail ? { detail: error.detail } : {}),
    });
  }
});

server.on('error', (error) => {
  console.error(`[recall-api] ${error.message}`);
  process.exitCode = 1;
});
server.listen(PORT, HOST, () => {
  console.log(`[recall-api] ${PROVIDER}/${MODEL} companion listening on http://${HOST}:${PORT}`);
});

function stop() {
  shutdownHarvest();
  server.close(() => process.exit(0));
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
