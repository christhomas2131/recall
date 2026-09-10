import { spawnSync } from 'node:child_process';
import { access, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const appRoot = resolve(import.meta.dirname, '..');
const toolsRoot = join(appRoot, '.recall-tools');
const destination = join(toolsRoot, 'career-churn-furnace');
const marker = join(destination, 'pyproject.toml');
const repository = process.env.RECALL_CCF_REPOSITORY
  ?? 'https://github.com/christhomas2131/career-churn-furnace.git';
const commit = process.env.RECALL_CCF_COMMIT
  ?? '492fc715d44ef7e8ee6e9c1cbe10f0b3f80398a2';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, cwd = process.cwd()) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}.`);
}

function capture(command, args, cwd = process.cwd()) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : '';
}

if (process.argv.includes('--check')) {
  const head = (await exists(marker)) ? capture('git', ['rev-parse', 'HEAD'], destination) : '';
  console.log(`Harvest pin: ${commit}`);
  console.log(head === commit ? 'Managed Harvest checkout matches the pin.' : 'Managed Harvest checkout is missing or does not match the pin.');
  process.exitCode = head === commit ? 0 : 1;
} else {
  if (dirname(destination) !== toolsRoot) throw new Error('Unsafe managed Harvest destination.');
  await mkdir(toolsRoot, { recursive: true });
  if (!(await exists(marker))) {
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    run('git', ['init'], destination);
    run('git', ['remote', 'add', 'origin', repository], destination);
    try {
      run('git', ['fetch', '--depth', '1', 'origin', commit], destination);
      run('git', ['checkout', '--detach', 'FETCH_HEAD'], destination);
    } catch (error) {
      throw new Error(`Could not install pinned Harvest commit ${commit}. The upstream repository must publish that commit. ${error.message}`);
    }
  } else {
    const head = capture('git', ['rev-parse', 'HEAD'], destination);
    if (head !== commit) {
      const dirty = capture('git', ['status', '--porcelain'], destination);
      if (dirty) throw new Error('Managed Harvest checkout has local changes. Move or commit them before updating it.');
      run('git', ['fetch', '--depth', '1', 'origin', commit], destination);
      run('git', ['checkout', '--detach', 'FETCH_HEAD'], destination);
    }
  }

  run('uv', ['sync', '--frozen'], destination);
  console.log('\nHarvest engine installed at the pinned commit. Complete its one-time candidate/search onboarding before the first live crawl.');
}
