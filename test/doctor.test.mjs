import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runDoctor,
  formatDoctor,
  meetsNode,
  requiredNode,
  readVersion,
} from '../lib/doctor.mjs';

const validCreds = { client_email: 'gsc-reader@example.iam.gserviceaccount.com', private_key: 'x' };

function status(report, key) {
  return report.checks.find((c) => c.key === key).status;
}

test('readVersion returns the package version', () => {
  assert.match(readVersion(), /^\d+\.\d+\.\d+/);
});

test('requiredNode parses the engines field to a bare version', () => {
  assert.match(requiredNode(), /^\d+\.\d+/);
});

test('meetsNode compares versions correctly', () => {
  assert.equal(meetsNode('22.5.0', '22.5'), true);
  assert.equal(meetsNode('24.0.0', '22.5'), true);
  assert.equal(meetsNode('22.4.0', '22.5'), false);
  assert.equal(meetsNode('18.0.0', '22.5'), false);
});

test('all checks pass with a valid key and reachable API', async () => {
  const report = await runDoctor({
    nodeVersion: '24.0.0',
    fileExists: () => true,
    load: () => validCreds,
    listSitesFn: async () => [{}, {}, {}],
    serverReady: () => true,
  });
  assert.equal(report.ok, true);
  assert.equal(status(report, 'properties'), 'info');
  assert.equal(report.checks.find((c) => c.key === 'properties').detail, '3');
});

test('an outdated Node version fails the node check', async () => {
  const report = await runDoctor({
    nodeVersion: '18.0.0',
    fileExists: () => true,
    load: () => validCreds,
    listSitesFn: async () => [],
    serverReady: () => true,
  });
  assert.equal(status(report, 'node'), 'fail');
  assert.equal(report.ok, false);
});

test('a missing key file skips the credential-dependent checks', async () => {
  const report = await runDoctor({
    nodeVersion: '24.0.0',
    fileExists: () => false,
    serverReady: () => true,
  });
  assert.equal(status(report, 'keyFile'), 'fail');
  assert.equal(status(report, 'keyJson'), 'skip');
  assert.equal(status(report, 'auth'), 'skip');
  assert.equal(status(report, 'properties'), 'skip');
  assert.equal(report.ok, false);
});

test('malformed credentials fail the JSON check and skip auth', async () => {
  const report = await runDoctor({
    nodeVersion: '24.0.0',
    fileExists: () => true,
    load: () => {
      throw new Error('Service-account key is not valid JSON.');
    },
    serverReady: () => true,
  });
  assert.equal(status(report, 'keyJson'), 'fail');
  assert.equal(status(report, 'auth'), 'skip');
});

test('a disabled API is reported distinctly from an auth failure', async () => {
  const report = await runDoctor({
    nodeVersion: '24.0.0',
    fileExists: () => true,
    load: () => validCreds,
    listSitesFn: async () => {
      throw new Error('Search Console API has not been used in project 123 or it is disabled.');
    },
    serverReady: () => true,
  });
  assert.equal(status(report, 'auth'), 'pass');
  assert.equal(status(report, 'api'), 'fail');
});

test('an auth failure is reported on the auth check', async () => {
  const report = await runDoctor({
    nodeVersion: '24.0.0',
    fileExists: () => true,
    load: () => validCreds,
    listSitesFn: async () => {
      throw new Error('invalid_grant: Invalid JWT Signature.');
    },
    serverReady: () => true,
  });
  assert.equal(status(report, 'auth'), 'fail');
  assert.equal(status(report, 'api'), 'skip');
});

test('doctor never leaks credential material in check details', async () => {
  const report = await runDoctor({
    nodeVersion: '24.0.0',
    fileExists: () => true,
    load: () => validCreds,
    listSitesFn: async () => {
      throw new Error('auth failed -----BEGIN PRIVATE KEY-----\nLEAK\n-----END PRIVATE KEY-----');
    },
    serverReady: () => true,
  });
  const text = formatDoctor(report);
  assert.doesNotMatch(text, /LEAK/);
  assert.doesNotMatch(text, /BEGIN PRIVATE KEY/);
});

test('formatDoctor renders symbols and the property count', async () => {
  const report = await runDoctor({
    nodeVersion: '24.0.0',
    fileExists: () => true,
    load: () => validCreds,
    listSitesFn: async () => [{}, {}],
    serverReady: () => true,
  });
  const text = formatDoctor(report);
  assert.match(text, /Node\.js version\s+✓/);
  assert.match(text, /Accessible properties\s+2/);
  assert.match(text, /All checks passed/);
});
