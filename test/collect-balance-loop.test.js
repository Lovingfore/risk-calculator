import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const bash = process.platform === 'win32' && existsSync('C:/Program Files/Git/bin/bash.exe')
  ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const script = resolve('scripts/collect-balance-loop.sh');

function git(directory, ...args) {
  const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

async function fixture(t, { failures, cycles }) {
  const root = await mkdtemp(join(tmpdir(), 'balance-loop-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace');
  const origin = join(root, 'origin.git');
  const history = join(root, 'risk-calculator-balance');
  const collector = join(root, 'risk-calculator-collector', 'scripts');
  const bin = join(root, 'bin');
  await Promise.all([workspace, origin, history, collector, bin].map(path => mkdir(path, { recursive: true })));
  git(origin, 'init', '--bare');
  git(workspace, 'init', '-b', 'main');
  git(workspace, 'config', 'user.name', 'Collector test');
  git(workspace, 'config', 'user.email', 'collector@example.test');
  git(workspace, 'config', 'commit.gpgsign', 'false');
  git(workspace, 'commit', '--allow-empty', '-m', 'Initial');
  git(workspace, 'remote', 'add', 'origin', origin);

  // Exercise real commits/pushes. Only the remote transport and five-minute waits
  // are replaced: the remote rejects the first N pushes, then accepts them.
  const hook = join(origin, 'hooks', 'pre-receive');
  await writeFile(hook, `#!/usr/bin/env bash
count=0
if [[ -f "$PUSH_COUNT_FILE" ]]; then read -r count < "$PUSH_COUNT_FILE"; fi
count=$((count + 1))
printf '%s\\n' "$count" > "$PUSH_COUNT_FILE"
if (( count <= ${failures} )); then
  echo 'Simulated temporary TLS transport failure' >&2
  exit 1
fi
`);
  await chmod(hook, 0o755);
  await writeFile(join(collector, 'collect-balance.js'), `
const fs = require('node:fs');
const previous = fs.existsSync('history.jsonl') ? fs.readFileSync('history.jsonl', 'utf8') : '';
const sample = JSON.stringify({ fixture: previous.trim().split('\\n').filter(Boolean).length + 1 });
fs.writeFileSync('history.jsonl', previous + sample + '\\n');
fs.writeFileSync('latest.json', sample);
`);

  const result = spawnSync(bash, ['-c', 'bash "$TEST_SCRIPT"'], {
    cwd: workspace,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      GITHUB_WORKSPACE: workspace.replaceAll('\\', '/'),
      RUNNER_TEMP: root.replaceAll('\\', '/'),
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      HISTORY_BRANCH_EXISTS: 'false',
      CONTINUE_LOOP: 'true',
      COLLECTION_CYCLES: String(cycles),
      COLLECTION_INTERVAL_SECONDS: '0',
      PUSH_RETRY_DELAY_SECONDS: '0',
      PUSH_COUNT_FILE: join(root, 'push-count').replaceAll('\\', '/'),
      TEST_BIN: bin.replaceAll('\\', '/'),
      TEST_SCRIPT: script.replaceAll('\\', '/'),
    },
  });
  return { result, workspace, origin, history, root };
}

test('a temporary push failure is retried and the sample reaches the history branch', async t => {
  const { result, origin } = await fixture(t, { failures: 1, cycles: 1 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(git(origin, 'show', 'balance-history:history.jsonl'), '{"fixture":1}\n');
});

test('an exhausted push retry keeps sampling and publishes the backlog on the next cycle', async t => {
  const { result, origin } = await fixture(t, { failures: 3, cycles: 2 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(git(origin, 'show', 'balance-history:history.jsonl'), '{"fixture":1}\n{"fixture":2}\n');
  assert.equal(git(origin, 'show', 'balance-history:latest.json'), '{"fixture":2}');
});

test('persistent push failures preserve the local sample and report a failed batch', async t => {
  const { result, workspace, history } = await fixture(t, { failures: 100, cycles: 1 });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(await readFile(join(history, 'history.jsonl'), 'utf8'), '{"fixture":1}\n');
  assert.equal(git(workspace, 'show', 'HEAD:history.jsonl'), '{"fixture":1}\n');
  assert.match(result.stdout, /::error::/);
});
