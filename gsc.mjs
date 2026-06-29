import { google } from 'googleapis';

const KEY = process.env.GSC_KEY_PATH || `${process.env.HOME}/.config/gsc-mcp/key.json`;
const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];

async function client() {
  const auth = new google.auth.GoogleAuth({ keyFile: KEY, scopes: SCOPES });
  return google.searchconsole({ version: 'v1', auth });
}

export async function listSites() {
  const sc = await client();
  const res = await sc.sites.list();
  return res.data.siteEntry ?? [];
}

export async function searchAnalytics(siteUrl, body) {
  const sc = await client();
  const res = await sc.searchanalytics.query({ siteUrl, requestBody: body });
  return res.data;
}

export async function inspectUrl(siteUrl, inspectionUrl) {
  const sc = await client();
  const res = await sc.urlInspection.index.inspect({
    requestBody: { siteUrl, inspectionUrl },
  });
  return res.data;
}

export async function listSitemaps(siteUrl) {
  const sc = await client();
  const res = await sc.sitemaps.list({ siteUrl });
  return res.data.sitemap ?? [];
}
