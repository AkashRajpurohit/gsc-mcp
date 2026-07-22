import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { google } from 'googleapis';
import { withRetry } from './util/retry.mjs';

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];

export function keyPath() {
  return process.env.GSC_KEY_PATH || join(homedir(), '.config', 'gsc-mcp', 'key.json');
}

export function loadCredentials(path = keyPath()) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `Service-account key not found at ${path}. Set GSC_KEY_PATH or create the key (see README).`,
    );
  }
  let creds;
  try {
    creds = JSON.parse(raw);
  } catch {
    throw new Error(`Service-account key at ${path} is not valid JSON.`);
  }
  if (!creds || typeof creds !== 'object' || !creds.client_email || !creds.private_key) {
    throw new Error(
      `Service-account key at ${path} is missing required fields (client_email, private_key).`,
    );
  }
  return creds;
}

let makeClient = async () => {
  const auth = new google.auth.GoogleAuth({ credentials: loadCredentials(), scopes: SCOPES });
  return google.searchconsole({ version: 'v1', auth });
};

export function __setClientFactory(factory) {
  makeClient = factory;
}

export async function listSites() {
  const sc = await makeClient();
  const res = await withRetry(() => sc.sites.list());
  return res.data.siteEntry ?? [];
}

export async function searchAnalytics(siteUrl, body) {
  const sc = await makeClient();
  const res = await withRetry(() => sc.searchanalytics.query({ siteUrl, requestBody: body }));
  return res.data;
}

export async function inspectUrl(siteUrl, inspectionUrl) {
  const sc = await makeClient();
  const res = await withRetry(() => sc.urlInspection.index.inspect({ requestBody: { siteUrl, inspectionUrl } }));
  return res.data;
}

export async function listSitemaps(siteUrl) {
  const sc = await makeClient();
  const res = await withRetry(() => sc.sitemaps.list({ siteUrl }));
  return res.data.sitemap ?? [];
}
