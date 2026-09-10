import { spawn } from 'node:child_process';

const providerPort = 8790;
const env = {
  ...process.env,
  RECALL_PROVIDER: 'openai',
  RECALL_MODEL: 'e2e-model',
  OPENAI_API_KEY: 'e2e-placeholder-not-a-real-key',
  RECALL_OPENAI_BASE_URL: `http://127.0.0.1:${providerPort}`,
  RECALL_E2E_PROVIDER_PORT: String(providerPort),
};
const provider = spawn(process.execPath, ['scripts/e2e-provider.mjs'], { env, stdio: 'inherit', windowsHide: true });
const app = spawn(process.execPath, ['scripts/start-api.mjs'], { env, stdio: 'inherit', windowsHide: true });

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  provider.kill();
  app.kill();
  process.exit(code);
}
provider.on('exit', (code) => stop(code ?? 1));
app.on('exit', (code) => stop(code ?? 1));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
