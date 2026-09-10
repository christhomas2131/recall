import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function waitForHealth(url) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Bridge did not start at ${url}.`);
}

async function runCase(provider) {
  let captured;
  const mock = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    captured = {
      url: request.url,
      headers: request.headers,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
    };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(provider === 'openai'
      ? { output_text: '{"ok":true}' }
      : { content: [{ type: 'text', text: '{"ok":true}' }] }));
  });
  const providerPort = await listen(mock);

  const probe = createServer();
  const bridgePort = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const token = randomBytes(32).toString('hex');
  const baseUrl = `http://127.0.0.1:${providerPort}`;
  const bridgeUrl = `http://127.0.0.1:${bridgePort}`;
  const child = spawn(process.execPath, ['scripts/recall-api-bridge.mjs'], {
    env: {
      ...process.env,
      RECALL_PROVIDER: provider,
      RECALL_MODEL: 'mock-model',
      RECALL_BRIDGE_PORT: String(bridgePort),
      RECALL_BRIDGE_TOKEN: token,
      RECALL_UI_ORIGIN: 'http://127.0.0.1:5173',
      OPENAI_API_KEY: 'openai-test-secret',
      ANTHROPIC_API_KEY: 'anthropic-test-secret',
      RECALL_OPENAI_BASE_URL: baseUrl,
      RECALL_ANTHROPIC_BASE_URL: baseUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  try {
    const health = await waitForHealth(bridgeUrl);
    assert.deepEqual(health, { ok: true, provider, model: 'mock-model' });

    const denied = await fetch(`${bridgeUrl}/api/recall-agent/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
      body: '{}',
    });
    assert.equal(denied.status, 401);

    const hostile = await fetch(`${bridgeUrl}/api/recall-agent/complete`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://hostile.invalid',
        'x-recall-bridge-token': token,
      },
      body: JSON.stringify({ system: 'Return JSON.', user: 'Test request.' }),
    });
    assert.equal(hostile.status, 403);

    const response = await fetch(`${bridgeUrl}/api/recall-agent/complete`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://127.0.0.1:5173',
        'x-recall-bridge-token': token,
      },
      body: JSON.stringify({ system: 'Return JSON.', user: 'Test request.', maxTokens: 100 }),
    });
    const responseText = await response.text();
    assert.equal(response.status, 200, responseText);
    assert.deepEqual(JSON.parse(responseText), { text: '{"ok":true}' });

    if (provider === 'openai') {
      assert.equal(captured.url, '/v1/responses');
      assert.equal(captured.headers.authorization, 'Bearer openai-test-secret');
      assert.equal(captured.body.store, false);
      assert.equal(captured.body.text.format.type, 'json_object');
      assert.equal(captured.body.max_output_tokens, 256);
    } else {
      assert.equal(captured.url, '/v1/messages');
      assert.equal(captured.headers['x-api-key'], 'anthropic-test-secret');
      assert.equal(captured.headers['anthropic-version'], '2023-06-01');
      assert.equal(captured.body.max_tokens, 256);
    }
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    await new Promise((resolve) => mock.close(resolve));
  }
  if (stderr) throw new Error(stderr);
}

await runCase('openai');
await runCase('anthropic');
console.log('API bridge integration tests passed for OpenAI and Anthropic.');
