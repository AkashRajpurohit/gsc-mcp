#!/usr/bin/env node
const REQUIRED_NODE = '22.5';

function meets(current, required) {
  const c = current.split('.').map(Number);
  const r = required.split('.').map(Number);
  for (let i = 0; i < r.length; i++) {
    const cv = c[i] || 0;
    const rv = r[i] || 0;
    if (cv > rv) return true;
    if (cv < rv) return false;
  }
  return true;
}

if (!meets(process.versions.node, REQUIRED_NODE)) {
  process.stderr.write(
    `gsc-mcp requires Node.js >= ${REQUIRED_NODE}. You are running ${process.versions.node}.\n` +
      'Upgrade Node (https://nodejs.org) and try again.\n',
  );
  process.exit(1);
}

const HELP = `gsc-mcp — safe, local, read-only access to Google Search Console

Usage:
  gsc-mcp [serve]              Start the MCP stdio server (default; this is what MCP clients run)
  gsc-mcp doctor              Check your setup (Node, credentials, auth, API, properties)
  gsc-mcp sites              List the properties your credential can read
  gsc-mcp queries <site>     Top queries for a property (last 90 days)
  gsc-mcp pages <site>       Top pages for a property (last 90 days)
  gsc-mcp perf <site>        Daily clicks/impressions for a property (last 90 days)
  gsc-mcp inspect <site> <url>   Index status of a single URL
  gsc-mcp sitemaps <site>    Submitted sitemaps and their counts
  gsc-mcp --help             Show this help
  gsc-mcp --version          Show the version

Environment:
  GSC_KEY_PATH   Path to the service-account JSON key
                 (default: ~/.config/gsc-mcp/key.json)

Register with an MCP client (example: Claude Code):
  claude mcp add gsc --scope user -- npx -y @akashrajpurohit/gsc-mcp

Docs: https://github.com/AkashRajpurohit/gsc-mcp
`;

const ago = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const print = (x) => process.stdout.write(`${JSON.stringify(x, null, 2)}\n`);

async function fail(message) {
  const { sanitize } = await import('../lib/mcp.mjs');
  process.stderr.write(`ERROR: ${sanitize(message)}\n`);
  process.exit(1);
}

async function runSanity(cmd, rest) {
  const gsc = await import('../lib/gsc.mjs');
  try {
    if (cmd === 'sites') print(await gsc.listSites());
    else if (cmd === 'perf')
      print(await gsc.searchAnalytics(rest[0], { startDate: ago(90), endDate: ago(1), dimensions: ['date'], rowLimit: 1000 }));
    else if (cmd === 'pages')
      print((await gsc.searchAnalytics(rest[0], { startDate: ago(90), endDate: ago(1), dimensions: ['page'], rowLimit: 50 })).rows ?? []);
    else if (cmd === 'queries')
      print((await gsc.searchAnalytics(rest[0], { startDate: ago(90), endDate: ago(1), dimensions: ['query'], rowLimit: 50 })).rows ?? []);
    else if (cmd === 'inspect') print(await gsc.inspectUrl(rest[0], rest[1]));
    else if (cmd === 'sitemaps') print(await gsc.listSitemaps(rest[0]));
  } catch (e) {
    await fail(e?.message ?? String(e));
  }
}

const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
  const { readVersion } = await import('../lib/doctor.mjs');
  process.stdout.write(`${readVersion()}\n`);
} else if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
  process.stdout.write(HELP);
} else if (cmd === 'doctor') {
  const { runDoctor, formatDoctor } = await import('../lib/doctor.mjs');
  const report = await runDoctor();
  process.stdout.write(`${formatDoctor(report)}\n`);
  process.exit(report.ok ? 0 : 1);
} else if (cmd === undefined || cmd === 'serve' || cmd === 'start') {
  const { start } = await import('../lib/mcp.mjs');
  await start();
} else if (['sites', 'perf', 'pages', 'queries', 'inspect', 'sitemaps'].includes(cmd)) {
  await runSanity(cmd, args.slice(1));
} else {
  process.stderr.write(`Unknown command: ${cmd}\n\n`);
  process.stdout.write(HELP);
  process.exit(1);
}
