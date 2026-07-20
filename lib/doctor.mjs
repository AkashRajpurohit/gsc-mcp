import { existsSync } from 'node:fs';
import pkg from '../package.json' with { type: 'json' };
import { keyPath, loadCredentials, listSites } from './gsc.mjs';
import { sanitize, TOOLS } from './mcp.mjs';

export const PASS = 'pass';
export const FAIL = 'fail';
export const SKIP = 'skip';
export const INFO = 'info';

export function readVersion() {
  return pkg.version;
}

export function requiredNode() {
  return (pkg.engines?.node ?? '').replace(/[^\d.]/g, '') || '0';
}

export function meetsNode(current, required) {
  const c = String(current).split('.').map(Number);
  const r = String(required).split('.').map(Number);
  for (let i = 0; i < r.length; i++) {
    const cv = c[i] || 0;
    const rv = r[i] || 0;
    if (cv > rv) return true;
    if (cv < rv) return false;
  }
  return true;
}

function apiDisabled(message) {
  return /disabled|has not been used|SERVICE_DISABLED|not enabled/i.test(message);
}

export async function runDoctor(deps = {}) {
  const {
    nodeVersion = process.versions.node,
    required = requiredNode(),
    keyFile = keyPath(),
    fileExists = existsSync,
    load = loadCredentials,
    listSitesFn = listSites,
    serverReady = () => Array.isArray(TOOLS) && TOOLS.length > 0,
  } = deps;

  const checks = [];
  const add = (key, label, status, detail = '') => checks.push({ key, label, status, detail });

  add(
    'node',
    'Node.js version',
    meetsNode(nodeVersion, required) ? PASS : FAIL,
    `v${nodeVersion} (need >= ${required})`,
  );

  const hasKey = fileExists(keyFile);
  add('keyFile', 'Credentials file exists', hasKey ? PASS : FAIL, keyFile);

  let creds = null;
  if (!hasKey) {
    add('keyJson', 'Credentials JSON is valid', SKIP, 'no key file');
    add('auth', 'Google authentication works', SKIP);
    add('api', 'Search Console API enabled', SKIP);
    add('properties', 'Accessible properties', SKIP);
  } else {
    try {
      creds = load(keyFile);
      add('keyJson', 'Credentials JSON is valid', PASS, creds.client_email ?? '');
    } catch (e) {
      add('keyJson', 'Credentials JSON is valid', FAIL, sanitize(e?.message ?? String(e)));
    }

    if (!creds) {
      add('auth', 'Google authentication works', SKIP);
      add('api', 'Search Console API enabled', SKIP);
      add('properties', 'Accessible properties', SKIP);
    } else {
      try {
        const sites = await listSitesFn();
        add('auth', 'Google authentication works', PASS);
        add('api', 'Search Console API enabled', PASS);
        add('properties', 'Accessible properties', INFO, String(sites.length));
      } catch (e) {
        const msg = sanitize(e?.message ?? String(e));
        if (apiDisabled(msg)) {
          add('auth', 'Google authentication works', PASS);
          add('api', 'Search Console API enabled', FAIL, msg);
          add('properties', 'Accessible properties', SKIP);
        } else {
          add('auth', 'Google authentication works', FAIL, msg);
          add('api', 'Search Console API enabled', SKIP);
          add('properties', 'Accessible properties', SKIP);
        }
      }
    }
  }

  add('server', 'MCP server startup', serverReady() ? PASS : FAIL);

  const ok = checks.every((c) => c.status === PASS || c.status === INFO);
  return { ok, checks };
}

export function formatDoctor(report) {
  const symbol = { pass: '✓', fail: '✗', skip: '–', info: 'ℹ' };
  const width = 32;
  const lines = report.checks.map((c) => {
    const label = c.label.padEnd(width);
    if (c.status === INFO) return `${label}${c.detail}`;
    const detail = c.status === PASS ? '' : c.detail ? `  ${c.detail}` : '';
    return `${label}${symbol[c.status]}${detail}`;
  });
  const summary = report.ok
    ? '\nAll checks passed — you are ready to go.'
    : '\nSome checks need attention (see above). The README troubleshooting section can help.';
  return `${lines.join('\n')}\n${summary}`;
}
