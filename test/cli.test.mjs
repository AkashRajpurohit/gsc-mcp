import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const BIN = fileURLToPath(new URL('../bin/gsc-mcp.mjs', import.meta.url));

const env = { ...process.env, GSC_KEY_PATH: '/nonexistent/gsc-mcp/key.json' };

async function cli(args) {
  try {
    const { stdout, stderr } = await run('node', [BIN, ...args], { env });
    return { code: 0, stdout, stderr };
  } catch (e) {
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

test('--version prints the package version and exits 0', async () => {
  const { code, stdout } = await cli(['--version']);
  assert.equal(code, 0);
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+/);
});

test('--help prints usage and exits 0', async () => {
  const { code, stdout } = await cli(['--help']);
  assert.equal(code, 0);
  assert.match(stdout, /Usage:/);
  assert.match(stdout, /gsc-mcp doctor/);
});

test('doctor runs offline, reports the missing key, and exits non-zero', async () => {
  const { code, stdout } = await cli(['doctor']);
  assert.equal(code, 1);
  assert.match(stdout, /Credentials file exists\s+✗/);
  assert.match(stdout, /\/nonexistent\/gsc-mcp\/key\.json/);
});

test('an unknown command prints help and exits non-zero', async () => {
  const { code, stdout, stderr } = await cli(['definitely-not-a-command']);
  assert.equal(code, 1);
  assert.match(stderr, /Unknown command/);
  assert.match(stdout, /Usage:/);
});
