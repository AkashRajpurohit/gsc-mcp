<div align="center" width="100%">
  <h2>🔍 gsc-mcp</h2>
  <p>Give your AI assistant <strong>read-only</strong> access to your <a href="https://search.google.com/search-console">Google Search Console</a> data — local, private, and across every property you own.</p>
  <a target="_blank" href="https://github.com/AkashRajpurohit/gsc-mcp/stargazers"><img src="https://img.shields.io/github/stars/AkashRajpurohit/gsc-mcp" /></a>
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

Checking how a site is doing on Google usually means logging into Search Console, picking a property, fiddling with date ranges, and squinting at charts. `gsc-mcp` wires your assistant — Claude Code, Claude Desktop, Cursor, or any MCP client — straight to the Search Console API, so you can just ask _"what are my top queries this month?"_ or _"is this page indexed yet?"_ and get real numbers back in seconds.

It's built to be **safe by construction**:

- 🔒 **Read-only.** It uses Google's read-only Search Console scope, so your assistant can look but _physically_ cannot submit, change, or delete anything.
- 🏠 **Local & private.** It runs on your own machine and talks only to Google — no third-party server in the middle, no telemetry, no accounts.
- 🗝️ **One credential, every property.** A single service-account key covers all the sites you own, so you can ask across properties without switching accounts.

<div align="center">
  <img src="https://raw.githubusercontent.com/AkashRajpurohit/gsc-mcp/main/assets/demo.gif" alt="gsc-mcp in action — asking an assistant about Search Console data" width="100%" />
</div>

## ✨ What it does and does not do

**It does:**

- List every Search Console property the credential can read.
- Pull clicks, impressions, CTR, and average position — grouped by query, page, date, country, device, or search appearance.
- Check the index status of any URL (indexed or not, last crawl, canonical, coverage state, mobile usability).
- Show your submitted sitemaps and their indexed-vs-submitted counts.

**It does not:**

- **Write anything.** The credential uses Google's read-only Search Console scope, so it cannot submit sitemaps, change settings, add or remove properties, or modify your account in any way.
- Bypass Search Console's own data limits. It sees exactly what the API exposes — the same ~16-month window and sampling Google gives everyone.
- Send your data anywhere except between your machine and Google's API. There is no third-party server in the middle.

## 📦 Before you start

You need:

- A **Google Cloud project** and the `gcloud` CLI (or the Cloud Console) to create a service account.
- One or more **verified Google Search Console properties** you can grant access on.
- **[Node.js](https://nodejs.org/) 22.5 or newer.**
- An MCP-capable assistant (for example [Claude Code](https://claude.com/claude-code)).

## 🔑 Get a credential

The server authenticates as a **service account** — a robot Google identity with its own email. You create it once, grant it read access on each property, and it can then read all of them.

### 1. Create the service account and key

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud services enable searchconsole.googleapis.com
gcloud iam service-accounts create gsc-reader --display-name="GSC Reader"

mkdir -p ~/.config/gsc-mcp
gcloud iam service-accounts keys create ~/.config/gsc-mcp/key.json \
  --iam-account=gsc-reader@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

That writes a JSON key to `~/.config/gsc-mcp/key.json`. Keep it private — it is a credential, not config. (This repo's `.gitignore` already blocks `*key*.json` so you can't commit it by accident.)

The service account lives in one Cloud project, but its identity works for any property you grant it on — the project choice does not matter.

### 2. Grant it on each property

In [Search Console](https://search.google.com/search-console), open each property → **Settings → Users and permissions → Add user**. Add the service-account email (`gsc-reader@YOUR_PROJECT_ID.iam.gserviceaccount.com`) with the **Restricted** (read) role.

Adding a new site later is just one more grant here — no code or config changes.

## 🚀 Install

No clone or global install needed — the server runs straight from npm with `npx`. Point your MCP client at it, and it fetches and runs on demand.

First, confirm your setup is good with the built-in diagnostic:

```bash
npx @akashrajpurohit/gsc-mcp doctor
```

You should see all green checks (and a count of your accessible properties). Then register the server with your assistant.

### Claude Code

```bash
claude mcp add gsc --scope user -- npx -y @akashrajpurohit/gsc-mcp
```

`--scope user` registers it for every Claude Code session on the machine. Restart the session (or start a new one) to pick up the tools.

### Claude Desktop

Open **Settings → Developer → Edit Config** (or edit `claude_desktop_config.json` directly) and add:

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

Restart Claude Desktop.

### Cursor

Open **Settings → MCP → Add new global MCP server** (or edit `~/.cursor/mcp.json`) and add the same `gsc` entry as above.

### Windsurf

Edit `~/.codeium/windsurf/mcp_config.json` and add the same `gsc` entry under `mcpServers`.

### VS Code (GitHub Copilot)

Add it to `.vscode/mcp.json` in your workspace (or run **MCP: Add Server** from the Command Palette):

```json
{
  "servers": {
    "gsc": {
      "command": "npx",
      "args": ["-y", "@akashrajpurohit/gsc-mcp"]
    }
  }
}
```

### Any other MCP client

Register a **stdio** server whose command is `npx -y @akashrajpurohit/gsc-mcp`. That is all the server needs.

> If your key is not at the default path, add `"env": { "GSC_KEY_PATH": "/absolute/path/to/key.json" }` to any of the entries above.

Once registered, start a new session and ask your assistant to "list my Search Console sites." If it comes back with your properties, you are ready.

<details>
<summary>Prefer to run from source?</summary>

```bash
git clone https://github.com/AkashRajpurohit/gsc-mcp.git
cd gsc-mcp
npm install
```

Then use `node /absolute/path/to/gsc-mcp/bin/gsc-mcp.mjs` as the command (instead of `npx -y @akashrajpurohit/gsc-mcp`) in any of the configs above. For Claude Code:

```bash
claude mcp add gsc --scope user -- node "$PWD/bin/gsc-mcp.mjs"
```

</details>

## 💬 How to use it

Just talk to your assistant. For example:

- "List all my Search Console properties."
- "What are my top 20 queries for example.com over the last 28 days?"
- "Show me the pages losing clicks this month compared to last."
- "Which queries have high impressions but a low CTR?"
- "Is `https://example.com/blog/my-post/` indexed by Google?"
- "How many URLs did my sitemap submit vs get indexed?"

Behind the scenes it offers four tools your assistant uses automatically:

| Tool | What it does |
|------|--------------|
| `gsc_list_sites` | Lists readable properties and their exact `siteUrl` values. |
| `gsc_search_analytics` | Clicks, impressions, CTR, and position grouped by query, page, date, country, device, or search appearance — with dimension filters, date ranges, and automatic pagination. |
| `gsc_inspect_url` | Index status of a single URL (indexed, last crawl, canonical, coverage). |
| `gsc_list_sitemaps` | Submitted vs indexed counts per sitemap, with errors and warnings. |

Every tool is **read-only** — the underlying credential physically cannot change anything in your account.

### The `gsc_search_analytics` query

You never have to hand-write Google's raw API format — the tool takes a clean input and returns rows plus metadata. A filtered query:

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

returns:

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

Highlights: `filters` (multiple, combined with AND; operators `equals`/`notEquals`/`contains`/`notContains`/`includingRegex`/`excludingRegex`), `dataState` (`final` | `all`), `aggregationType` (`auto` | `byProperty` | `byPage`), and automatic pagination — a `rowLimit` above the API's 25,000-per-request cap is fetched across pages, bounded by a `maxRows` safety ceiling. `site` and `siteUrl` are interchangeable.

## 🧪 Try it without an assistant

The `gsc-mcp` command also wraps the same core for a quick manual check — no MCP client required:

```bash
npx @akashrajpurohit/gsc-mcp doctor      # verify your setup
npx @akashrajpurohit/gsc-mcp sites       # list your properties
npx @akashrajpurohit/gsc-mcp queries  "sc-domain:example.com"
npx @akashrajpurohit/gsc-mcp pages    "sc-domain:example.com"
npx @akashrajpurohit/gsc-mcp perf     "sc-domain:example.com"
npx @akashrajpurohit/gsc-mcp inspect  "sc-domain:example.com" "https://example.com/blog/my-post/"
npx @akashrajpurohit/gsc-mcp sitemaps "sc-domain:example.com"
```

Domain properties look like `sc-domain:example.com`; URL-prefix properties look like `https://example.com/`. Run `sites` first to see the exact `siteUrl` for each of your properties. Run `gsc-mcp --help` for the full command list.

## ⚙️ Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GSC_KEY_PATH` | `~/.config/gsc-mcp/key.json` | Path to the service-account JSON key. |

## 🏗️ How it fits together

```
MCP client ──stdio──▶ bin/gsc-mcp.mjs ──▶ lib/mcp.mjs ──▶ lib/gsc.mjs ──▶ Google Search Console API
                      (CLI + server)      (tools)         (auth + calls)     (service-account key)
```

- `lib/gsc.mjs` — the Google API client. Loads and validates the service-account key and wraps the Search Console API (sites, search analytics, URL inspection, sitemaps).
- `lib/mcp.mjs` — the MCP server (stdio transport) that exposes those tools to your assistant, with input validation and secret-safe error handling.
- `lib/doctor.mjs` — the diagnostic used by `gsc-mcp doctor`.
- `bin/gsc-mcp.mjs` — the executable entry point: starts the server by default and provides `doctor`, `--help`, `--version`, and the manual read commands.

The core (`lib/gsc.mjs`) is transport-agnostic. To run this as an always-on remote MCP instead of a local stdio process, containerize it, expose it over HTTP/SSE behind an authenticating proxy, mount the key as a secret, and register the remote URL with your client — only the hosting changes.

## 🔒 Security & privacy

`gsc-mcp` is **safe by construction**: read-only by scope, local, and telemetry-free. In short — your assistant can look but never touch, and nothing leaves your machine except read-only calls to Google. See **[SECURITY.md](SECURITY.md)** for the full model and how to report a vulnerability.

- **Read-only.** Uses Google's `webmasters.readonly` scope — the credential physically cannot write, submit, or delete.
- **Local & private.** Runs on your machine, talks only to Google. No third-party server, no accounts, no telemetry.
- **Credential-safe.** Your key is read locally and never sent anywhere but Google; `*key*.json` is git-ignored; and all errors are sanitized so key material can never leak into logs or transcripts.

## 🩺 Troubleshooting

Start with the diagnostic — it pinpoints most problems in one shot:

```bash
npx @akashrajpurohit/gsc-mcp doctor
```

- **`gsc_list_sites` returns an empty list** — the service account isn't granted on any property yet. Re-check step 2: the email you added in Search Console must match your key's `client_email` exactly.
- **Auth or "file not found" errors** — the key isn't where the server expects it. Confirm the path, or set `GSC_KEY_PATH` to point at it.
- **A specific property 403s** — that one property hasn't been shared with the service account. Add it under Users and permissions.
- **"Search Console API ... is disabled"** — enable it once with `gcloud services enable searchconsole.googleapis.com` (or in the Cloud Console).

## 🧑‍💻 Contributing

The project is deliberately small and dependency-light. To work on it:

```bash
git clone https://github.com/AkashRajpurohit/gsc-mcp.git
cd gsc-mcp
npm install
npm test
```

Tests use Node's built-in test runner (`node --test`) — there is **no extra test dependency** to install. They are fully offline: every Google call is mocked or fixture-based, so **you do not need valid Google credentials to run them, and nothing touches the network.** The suite covers each MCP tool, the Search Console API wrapper, argument validation, credential loading (missing/malformed keys), the `doctor` diagnostic, the CLI, and simulated Google API failures (permission, quota, invalid property, unavailable URL), and it asserts that credential material is never echoed in error messages.

Run the suite with:

```bash
npm test
```

CI runs the same command on every push and pull request. Releases are cut by pushing a `v*` tag, which triggers the publish workflow (see `.github/workflows/release.yml`). Publishing uses **npm trusted publishing (OIDC)** — no long-lived npm token is stored, and provenance is attached automatically. Changes are tracked in [CHANGELOG.md](CHANGELOG.md).

### Project layout

| File | Responsibility |
|------|----------------|
| `lib/gsc.mjs` | Google API client: credential loading + read-only Search Console calls. |
| `lib/mcp.mjs` | MCP server, tool definitions, input validation, error sanitization. |
| `lib/doctor.mjs` | Setup diagnostic used by `gsc-mcp doctor`. |
| `bin/gsc-mcp.mjs` | Executable entry point (server + `doctor`/`--help`/`--version`/read commands). |
| `test/` | Offline test suite. |

## ⚖️ Licensing and disclaimer

**This project is not affiliated with, endorsed by, or associated with Google in any way.** It is an independent, open-source tool that talks to Google's public Search Console API using credentials you create and control. "Google Search Console" is a trademark of Google LLC and is used here only to describe what the tool works with.

The tool is released under the MIT license (see `LICENSE`). It is provided as-is, with no warranty. It only ever uses Google's read-only Search Console scope, so it can read your data but never modify your account.
