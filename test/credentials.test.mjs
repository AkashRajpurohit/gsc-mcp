import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { keyPath, loadCredentials } from '../gsc.mjs';

const savedEnv = process.env.GSC_KEY_PATH;
const savedHome = process.env.HOME;

afterEach(() => {
  if (savedEnv === undefined) delete process.env.GSC_KEY_PATH;
  else process.env.GSC_KEY_PATH = savedEnv;
  process.env.HOME = savedHome;
});

function tmpFile(name, contents) {
  const dir = mkdtempSync(join(tmpdir(), 'gsc-test-'));
  const p = join(dir, name);
  writeFileSync(p, contents);
  return p;
}

const VALID_KEY = JSON.stringify({
  type: 'service_account',
  client_email: 'gsc-reader@example.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nFAKEKEYMATERIAL\n-----END PRIVATE KEY-----\n',
});

test('keyPath defaults to ~/.config/gsc-mcp/key.json', () => {
  delete process.env.GSC_KEY_PATH;
  process.env.HOME = '/home/tester';
  assert.equal(keyPath(), '/home/tester/.config/gsc-mcp/key.json');
});

test('keyPath honours GSC_KEY_PATH override', () => {
  process.env.GSC_KEY_PATH = '/custom/key.json';
  assert.equal(keyPath(), '/custom/key.json');
});

test('loadCredentials throws a clear error when the key is missing', () => {
  const missing = join(tmpdir(), 'definitely-not-here-gsc.json');
  assert.throws(() => loadCredentials(missing), (e) => {
    assert.match(e.message, /not found/);
    assert.match(e.message, /GSC_KEY_PATH/);
    return true;
  });
});

test('loadCredentials throws on malformed JSON', () => {
  const p = tmpFile('key.json', '{ not valid json');
  assert.throws(() => loadCredentials(p), /not valid JSON/);
});

test('loadCredentials rejects JSON missing required fields', () => {
  const p = tmpFile('key.json', JSON.stringify({ type: 'service_account' }));
  assert.throws(() => loadCredentials(p), /missing required fields/);
});

test('loadCredentials returns parsed credentials for a valid key', () => {
  const p = tmpFile('key.json', VALID_KEY);
  const creds = loadCredentials(p);
  assert.equal(creds.client_email, 'gsc-reader@example.iam.gserviceaccount.com');
  assert.ok(creds.private_key);
});

test('credential errors never echo the private key material', () => {
  const p = tmpFile('key.json', JSON.stringify({ client_email: 'x@y.com' }));
  try {
    loadCredentials(p);
    assert.fail('expected loadCredentials to throw');
  } catch (e) {
    assert.doesNotMatch(e.message, /PRIVATE KEY/);
    assert.doesNotMatch(e.message, /FAKEKEYMATERIAL/);
  }
});
