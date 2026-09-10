import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const candidateRoots = [
  process.env.RECALL_CCF_ROOT,
  join(APP_ROOT, '.recall-tools', 'career-churn-furnace'),
  resolve(APP_ROOT, '..', 'Career Churn Furnace'),
  resolve(APP_ROOT, '..', '..', 'Career Churn Furnace'),
].filter(Boolean);

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

export async function findHarvestRuntime() {
  for (const root of candidateRoots) {
    const ccf = process.platform === 'win32'
      ? join(root, '.venv', 'Scripts', 'ccf.exe')
      : join(root, '.venv', 'bin', 'ccf');
    const python = process.platform === 'win32'
      ? join(root, '.venv', 'Scripts', 'python.exe')
      : join(root, '.venv', 'bin', 'python');
    if (!(await exists(ccf)) || !(await exists(python))) continue;
    try {
      const expression = process.env.RECALL_CCF_WORKSPACE
        ? 'workspace_from(__import__("os").environ["RECALL_CCF_WORKSPACE"])'
        : 'default_workspace()';
      const { stdout } = await execFileAsync(python, [
        '-c',
        `from career_churn_furnace.runtime import default_workspace, workspace_from; w=${expression}; print(w.crawler_data)`,
      ], { cwd: root, env: process.env, timeout: 10_000 });
      return { root, ccf, python, crawlerData: stdout.trim() };
    } catch {}
  }
  return null;
}

export async function harvestOnboarding(found) {
  if (!found) {
    return { ready: false, completed: 0, total: 9, missing: ['install'], recommendations: [] };
  }
  const expression = process.env.RECALL_CCF_WORKSPACE
    ? 'workspace_from(__import__("os").environ["RECALL_CCF_WORKSPACE"])'
    : 'default_workspace()';
  const script = [
    'import json',
    'from career_churn_furnace.runtime import default_workspace, workspace_from',
    'from career_churn_furnace.onboarding import progress',
    `w=${expression}`,
    'required=[w.profile, w.apply_profile]',
    'result=progress(w) if all(p.exists() for p in required) else {"ready":False,"completed":0,"total":9,"missing":["resume","ai","identity","history","evidence","search"],"recommendations":[]}',
    'print(json.dumps({k:result[k] for k in ("ready","completed","total","missing","recommendations")}))',
  ].join(';');
  try {
    const { stdout } = await execFileAsync(found.python, ['-c', script], {
      cwd: found.root,
      env: process.env,
      timeout: 10_000,
      maxBuffer: 256_000,
    });
    const value = JSON.parse(stdout);
    return {
      ready: value.ready === true,
      completed: Number(value.completed) || 0,
      total: Number(value.total) || 9,
      missing: Array.isArray(value.missing) ? value.missing.map(String) : [],
      recommendations: Array.isArray(value.recommendations) ? value.recommendations.map(String) : [],
    };
  } catch {
    return { ready: false, completed: 0, total: 9, missing: ['status-check'], recommendations: [] };
  }
}

export function harvestArgs(args) {
  if (!process.env.RECALL_CCF_WORKSPACE || args.includes('--workspace')) return args;
  return [...args, '--workspace', process.env.RECALL_CCF_WORKSPACE];
}
