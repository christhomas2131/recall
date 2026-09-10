import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { loadLocalEnv } from './local-env.mjs';

await loadLocalEnv();

const kind = process.env.RECALL_AGENT_KIND;
if (kind !== 'claude' && kind !== 'custom') throw new Error('RECALL_AGENT_KIND must be claude or custom.');
if (kind === 'custom' && !process.env.RECALL_AGENT_COMMAND?.trim()) throw new Error('Set RECALL_AGENT_COMMAND for custom mode.');

const token = randomBytes(32).toString('hex');
const bridgePort = Number(process.env.RECALL_BRIDGE_PORT ?? 8787);
const uiPort = Number(process.env.RECALL_UI_PORT ?? 5173);
const viteCommand = process.platform === 'win32'
  ? { command: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', `npm.cmd run dev -- --host 127.0.0.1 --port ${uiPort} --strictPort`] }
  : { command: 'npm', args: ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'] };
const env = {
  ...process.env,
  RECALL_BRIDGE_TOKEN: token,
  RECALL_BRIDGE_PORT: String(bridgePort),
  RECALL_BRIDGE_URL: `http://127.0.0.1:${bridgePort}`,
  RECALL_UI_ORIGIN: `http://127.0.0.1:${uiPort}`,
  VITE_LLM_TRANSPORT: kind,
};
const bridge = spawn(process.execPath, ['scripts/recall-command-bridge.mjs'], { env, stdio: 'inherit', windowsHide: true });
const vite = spawn(viteCommand.command, viteCommand.args, { env, stdio: 'inherit', windowsHide: true });
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  bridge.kill();
  vite.kill();
  process.exit(code);
}
bridge.on('exit', (code) => stop(code ?? 1));
vite.on('exit', (code) => stop(code ?? 1));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
