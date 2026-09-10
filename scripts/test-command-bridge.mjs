import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { parseClaudeOutput } from './agent-adapters.mjs';

const probe = createServer();
await new Promise((resolveListen, reject) => {
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', resolveListen);
});
const port = probe.address().port;
await new Promise((resolveClose) => probe.close(resolveClose));
const token = randomBytes(32).toString('hex');
const origin = 'http://127.0.0.1:5173';
const child = spawn(process.execPath, ['scripts/recall-command-bridge.mjs'], {
  env: {
    ...process.env,
    RECALL_AGENT_KIND: 'custom',
    RECALL_AGENT_COMMAND: process.execPath,
    RECALL_AGENT_ARGS_JSON: JSON.stringify([resolve('scripts/test-fixtures/fake-agent.mjs')]),
    RECALL_BRIDGE_PORT: String(port),
    RECALL_BRIDGE_TOKEN: token,
    RECALL_UI_ORIGIN: origin,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let stderr = '';
child.stderr.on('data', (chunk) => { stderr += chunk; });

async function waitForHealth() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error('Command bridge did not start.');
}

try {
  assert.deepEqual(await waitForHealth(), { ok: true, mode: 'custom' });
  const hostile = await fetch(`http://127.0.0.1:${port}/api/recall-agent/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://hostile.invalid', 'x-recall-bridge-token': token },
    body: JSON.stringify({ system: 'Return JSON.', user: 'Test.' }),
  });
  assert.equal(hostile.status, 403);
  const response = await fetch(`http://127.0.0.1:${port}/api/recall-agent/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, 'x-recall-bridge-token': token },
    body: JSON.stringify({ system: 'Return JSON.', user: 'Test.' }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(await response.json(), { text: '{"ok":true}' });
  assert.equal(parseClaudeOutput('{"type":"result","result":"{\\"ok\\":true}"}'), '{"ok":true}');
  assert.equal(parseClaudeOutput('{"structured_output":{"ok":true}}'), '{"ok":true}');
} finally {
  if (child.exitCode === null) {
    const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
    child.kill();
    await exited;
  }
}
if (stderr) throw new Error(stderr);
console.log('Command-agent bridge and adapter contract tests passed.');
