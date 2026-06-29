#!/usr/bin/env node
import { listSites, searchAnalytics, inspectUrl, listSitemaps } from './gsc.mjs';

const [, , cmd, ...args] = process.argv;
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const pr = (x) => console.log(JSON.stringify(x, null, 2));

try {
  if (cmd === 'sites') pr(await listSites());
  else if (cmd === 'perf')
    pr(await searchAnalytics(args[0], { startDate: ago(90), endDate: ago(1), dimensions: ['date'], rowLimit: 1000 }));
  else if (cmd === 'pages')
    pr((await searchAnalytics(args[0], { startDate: ago(90), endDate: ago(1), dimensions: ['page'], rowLimit: 50 })).rows ?? []);
  else if (cmd === 'queries')
    pr((await searchAnalytics(args[0], { startDate: ago(90), endDate: ago(1), dimensions: ['query'], rowLimit: 50 })).rows ?? []);
  else if (cmd === 'inspect') pr(await inspectUrl(args[0], args[1]));
  else if (cmd === 'sitemaps') pr(await listSitemaps(args[0]));
  else console.log('usage: node cli.mjs [sites | perf <site> | pages <site> | queries <site> | inspect <site> <url> | sitemaps <site>]');
} catch (e) {
  console.error('ERROR:', e?.message || e);
  process.exit(1);
}
