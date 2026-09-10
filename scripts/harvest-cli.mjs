import { spawn } from 'node:child_process';
import { findHarvestRuntime, harvestArgs } from './harvest-runtime.mjs';
import { loadLocalEnv } from './local-env.mjs';

await loadLocalEnv();

const found = await findHarvestRuntime();
if (!found) throw new Error('Harvest is not installed. Run npm run setup:harvest first.');
const args = harvestArgs(process.argv.slice(2));
if (!args.length) throw new Error('Specify a CCF command.');

const child = spawn(found.ccf, args, {
  cwd: found.root,
  env: process.env,
  stdio: 'inherit',
  windowsHide: false,
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
