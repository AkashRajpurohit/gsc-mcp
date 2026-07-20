<div align="center" width="100%">
  <h2>🔍 gsc-mcp</h2>
  <p>An MCP server that gives your AI assistant read-only access to your <a href="https://search.google.com/search-console">Google Search Console</a> data.</p>
  <a target="_blank" href="https://github.com/AkashRajpurohit/gsc-mcp/stargazers"><img src="https://img.shields.io/github/stars/AkashRajpurohit/gsc-mcp" /></a>
  <a target="_blank" href="https://www.npmjs.com/package/@akashrajpurohit/gsc-mcp"><img src="https://img.shields.io/npm/v/@akashrajpurohit/gsc-mcp?logo=npm" /></a>
  <a target="_blank" href="https://github.com/AkashRajpurohit/gsc-mcp/blob/main/LICENSE"><img src="https://img.shields.io/github/license/AkashRajpurohit/gsc-mcp" /></a>
  <img alt="Node version" src="https://img.shields.io/badge/node-%3E%3D22.5-339933?logo=nodedotjs&logoColor=white" />
  <img alt="MCP server" src="https://img.shields.io/badge/MCP-server-1f1f1f" />
  <img alt="Visitors" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fvc.akashrajpurohit.com%2Fc%2Fakash~gh~gsc-mcp&query=count&style=flat&logo=github&label=Visitors&color=066da5" />
  <a target="_blank" href="https://ko-fi.com/akashrajpurohit"><img src="https://img.shields.io/badge/Ko--fi-F16061?style=flat-square&logo=ko-fi&logoColor=white" /></a>
  <a target="_blank" href="https://akashrajpurohit.com/sponsors/?ref=gsc-mcp"><img src="https://img.shields.io/badge/Sponsor-AkashRajpurohit-F16061?style=flat-square&logoColor=white" /></a>
  <a target="_blank" href="https://twitter.com/akashwhocodes"><img alt="follow on twitter" src="https://img.shields.io/twitter/follow/akashwhocodes.svg?style=social&label=@akashwhocodes" /></a>
  <br />
  <br />
  <p align="center">
    <a href="https://github.com/AkashRajpurohit/gsc-mcp/issues/new?template=bug_report.yml">Bug report</a>
    ·
    <a href="https://github.com/AkashRajpurohit/gsc-mcp/issues/new?template=feature_request.yml">Feature request</a>
    ·
    <a href="https://github.com/AkashRajpurohit?tab=repositories">More projects</a>
  </p>
</div>
<hr />

Ask your assistant things like _"what are my top queries this month?"_ or _"is this page indexed yet?"_, and it pulls the numbers straight from the Search Console API. No opening the dashboard, no fiddling with date ranges.

The server runs on your own machine and only ever reads. It uses Google's read-only scope, so your assistant can see your data but cannot change anything in your account. One service-account key covers every property you own.

<div align="center">
  <img src="https://raw.githubusercontent.com/AkashRajpurohit/gsc-mcp/main/assets/demo.gif" alt="gsc-mcp in action" width="100%" />
</div>

## What you can ask

- "List all my Search Console properties."
- "What are my top 20 queries for example.com in the last 28 days?"
- "Which queries get lots of impressions but a low CTR?"
- "Show me the top pages for example.com on mobile."
- "Which pages lost the most clicks this month compared to last month?"
- "Is `https://example.com/blog/my-post/` indexed by Google?"
- "How many URLs did my sitemap submit versus get indexed?"

## Setup

You need [Node.js](https://nodejs.org/) 22.5 or newer and a Google service-account key that can read your properties. Three steps: create a key, grant it access, add the server to your client.

### 1. Create a service-account key

Create a service account in any Google Cloud project, save its JSON key to `~/.config/gsc-mcp/key.json`, and enable the Search Console API. The Cloud project you pick does not matter; the key works for any property you grant it on.

<details>
<summary>Commands (gcloud)</summary>

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud services enable searchconsole.googleapis.com
gcloud iam service-accounts create gsc-reader --display-name="GSC Reader"

mkdir -p ~/.config/gsc-mcp
gcloud iam service-accounts keys create ~/.config/gsc-mcp/key.json \
  --iam-account=gsc-reader@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

The key is a credential, not config, so keep it private. This repo's `.gitignore` blocks `*key*.json` so you cannot commit it by accident.

</details>

### 2. Grant it access to each property

In [Search Console](https://search.google.com/search-console), open each property, go to **Settings → Users and permissions → Add user**, and add the service account's email (`gsc-reader@YOUR_PROJECT_ID.iam.gserviceaccount.com`) with the **Restricted** (read) role. Adding a new site later is just one more grant here.

### 3. Add gsc-mcp to your client

**Claude Code:**

```bash
claude mcp add gsc --scope user -- npx -y @akashrajpurohit/gsc-mcp
```

<details>
<summary>Claude Desktop, Cursor, Windsurf, VS Code, and others</summary>

**Claude Desktop:** open **Settings → Developer → Edit Config** and add:

```json
{
  "mcpServers": {
    "gsc": {
      "command": "npx",
      "args": ["-y", "@akashrajpurohit/gsc-mcp"]
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json`) and **Windsurf** (`~/.codeium/windsurf/mcp_config.json`): add the same `gsc` entry under `mcpServers`.

**VS Code (GitHub Copilot)** (`.vscode/mcp.json`): use the same entry under `servers` instead of `mcpServers`.

**Any other client:** register a stdio server whose command is `npx -y @akashrajpurohit/gsc-mcp`.

**Running from source instead of npm?** Clone the repo, run `npm install`, and use `node /absolute/path/to/gsc-mcp/bin/gsc-mcp.mjs` as the command.

</details>

If your key is not at the default path, add `"env": { "GSC_KEY_PATH": "/path/to/key.json" }` to the entry (or set it in your shell for the CLI).

### 4. Check it works

```bash
npx @akashrajpurohit/gsc-mcp doctor
```

This checks your Node version, credentials, Google authentication, and how many properties you can read. If everything is green, start a new session in your client and ask it to list your Search Console sites.

## Tools

| Tool                   | What it does                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gsc_list_sites`       | Lists the properties you can read and their exact `siteUrl` values.                                                                                         |
| `gsc_search_analytics` | Clicks, impressions, CTR, and position, grouped by query, page, date, country, device, or search appearance. Supports filters, date ranges, and pagination. |
| `compare_search_performance` | Compares two date periods and reports the change in clicks, impressions, CTR, and position. Can group by page, query, country, or device to find the biggest movers. |
| `gsc_inspect_url`      | Index status of a single URL (indexed or not, last crawl, canonical, coverage).                                                                             |
| `gsc_list_sitemaps`    | Submitted versus indexed counts per sitemap, with any errors.                                                                                               |

Data comes straight from Search Console, so you see the same window Google shows everyone (about 16 months of history, with its usual sampling).

<details>
<summary>gsc_search_analytics request and response</summary>

You give it a clean request and get back the rows plus metadata about the query. You never write Google's raw API format.

Request:

```json
{
  "siteUrl": "sc-domain:example.com",
  "startDate": "2026-06-01",
  "endDate": "2026-06-30",
  "dimensions": ["query", "page"],
  "filters": [
    { "dimension": "country", "operator": "equals", "expression": "ind" }
  ],
  "searchType": "web",
  "rowLimit": 5000
}
```

Response:

```json
{
  "siteUrl": "sc-domain:example.com",
  "period": { "startDate": "2026-06-01", "endDate": "2026-06-30" },
  "dimensions": ["query", "page"],
  "rowCount": 842,
  "hasMore": false,
  "rows": [],
  "warnings": []
}
```

It also supports `dataState` (`final` or `all`), `aggregationType` (`auto`, `byProperty`, `byPage`), and automatic pagination past the API's 25,000-rows-per-request limit, capped by `maxRows`. Filter operators are `equals`, `notEquals`, `contains`, `notContains`, `includingRegex`, and `excludingRegex`, and multiple filters are combined with AND. `site` and `siteUrl` both work.

For a quick date range you can pass `datePreset` instead of computing dates: `last_7_days`, `last_28_days`, `last_3_months`, `last_6_months`, `last_12_months`, or `last_16_months` (each a rolling window ending yesterday). It works the same on `compare_search_performance`.

</details>

<details>
<summary>compare_search_performance response</summary>

Give it a current period (or `days`), and optionally a previous one. Without a previous period it uses the equal-length window right before the current one. The change is worked out in code, so the numbers are always consistent.

```json
{
  "current": { "startDate": "2026-06-01", "endDate": "2026-06-30" },
  "previous": { "startDate": "2026-05-02", "endDate": "2026-05-31" },
  "summary": {
    "clicks": { "current": 1840, "previous": 2160, "change": -320, "changePercent": -14.81 }
  },
  "groupBy": "page",
  "largestDeclines": [
    {
      "page": "https://example.com/docs",
      "currentClicks": 210,
      "previousClicks": 390,
      "change": -180,
      "changePercent": -46.15
    }
  ],
  "largestGains": []
}
```

`summary` also covers impressions, CTR, and position. With `groupBy` (page, query, country, or device) you get `largestDeclines` and `largestGains`, ranked by clicks change. For position, lower is better, so a positive change means the average rank got worse.

</details>

## Command line

The `gsc-mcp` command works on its own too, handy for a quick check without a client:

```bash
npx @akashrajpurohit/gsc-mcp sites
npx @akashrajpurohit/gsc-mcp queries "sc-domain:example.com"
npx @akashrajpurohit/gsc-mcp inspect "sc-domain:example.com" "https://example.com/blog/my-post/"
```

Run `gsc-mcp --help` for the full list. Domain properties look like `sc-domain:example.com`; URL-prefix properties look like `https://example.com/`.

## Configuration

| Variable       | Default                      | Description                           |
| -------------- | ---------------------------- | ------------------------------------- |
| `GSC_KEY_PATH` | `~/.config/gsc-mcp/key.json` | Path to the service-account JSON key. |

## Security & privacy

The server is read-only, runs locally, and collects no telemetry. Your key is read from disk and sent only to Google, never anywhere else, and errors are sanitized so key material never lands in logs or transcripts. Full details and how to report a vulnerability are in [SECURITY.md](SECURITY.md).

## Troubleshooting

Run `npx @akashrajpurohit/gsc-mcp doctor` first, since it catches most problems. Common ones:

- **`sites` returns an empty list:** the service account is not granted on any property yet. The email you added in Search Console must match the key's `client_email` exactly.
- **Auth or "file not found" errors:** the key is not where the server expects it. Check the path or set `GSC_KEY_PATH`.
- **One property returns 403:** that property has not been shared with the service account. Add it under Users and permissions.
- **"Search Console API is disabled":** enable it with `gcloud services enable searchconsole.googleapis.com`.

## Contributing

Contributions are welcome. The project is small and has no build step. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide and [ROADMAP.md](ROADMAP.md) for what is and is not planned.

```bash
git clone https://github.com/AkashRajpurohit/gsc-mcp.git
cd gsc-mcp
npm install
npm test
```

Tests use Node's built-in runner and are fully offline: no network and no real credentials needed. CI runs them on every push and pull request.

<details>
<summary>Project layout and release process</summary>

| Path              | Responsibility                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `lib/gsc.mjs`     | Google API client: credential loading and read-only Search Console calls.                |
| `lib/mcp.mjs`     | MCP server, tool definitions, input validation, error sanitization.                      |
| `lib/doctor.mjs`  | The `gsc-mcp doctor` diagnostic.                                                         |
| `bin/gsc-mcp.mjs` | Executable entry point (server plus `doctor`, `--help`, `--version`, and read commands). |
| `test/`           | Offline test suite.                                                                      |

Releases are cut by pushing a `v*` tag, which runs the publish workflow (`.github/workflows/release.yml`). Publishing uses npm trusted publishing (OIDC), so no npm token is stored and provenance is attached automatically. Changes are tracked in [CHANGELOG.md](CHANGELOG.md).

</details>

## License

MIT. See [LICENSE](LICENSE).

This project is not affiliated with, endorsed by, or associated with Google. It is an independent tool that talks to Google's public Search Console API using credentials you create and control. "Google Search Console" is a trademark of Google LLC, used here only to describe what the tool works with. The tool is provided as-is, with no warranty.
