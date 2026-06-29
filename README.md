# gsc-mcp

A small Model Context Protocol (MCP) server that gives an MCP client (e.g. Claude Code) read access to Google Search Console across one or more verified properties. One service account is granted on each property, so the same server serves every site you own.

## Architecture

```
MCP client ──stdio──▶ mcp.mjs ──▶ gsc.mjs ──▶ Google Search Console API
                      (tools)     (auth + calls)   (service-account key)
```

- `gsc.mjs` — Google API client. Authenticates with a service-account key and wraps the Search Console API: sites, search analytics, URL inspection, sitemaps.
- `mcp.mjs` — MCP server (stdio transport) that exposes the tools to the client.
- `cli.mjs` — the same core, runnable by hand for testing (e.g. `node cli.mjs sites`).
- Credential — a service-account JSON key, kept outside this repo (default path `~/.config/gsc-mcp/key.json`, override with `GSC_KEY_PATH`).

## Tools

| Tool | Purpose |
|------|---------|
| `gsc_list_sites` | List readable properties and their exact `siteUrl` values. |
| `gsc_search_analytics` | Clicks, impressions, CTR, and position grouped by query, page, date, country, or device. |
| `gsc_inspect_url` | Index status of a single URL (indexed, last crawl, canonical, coverage). |
| `gsc_list_sitemaps` | Submitted vs indexed counts per sitemap. |

## Setup

### 1. Create the service account (one time)

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud services enable searchconsole.googleapis.com
gcloud iam service-accounts create gsc-reader --display-name="GSC Reader"
gcloud iam service-accounts keys create ~/.config/gsc-mcp/key.json \
  --iam-account=gsc-reader@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

The service account lives in one project, but its identity works for any property you grant it on — the project choice does not matter.

### 2. Grant it on each property

In Google Search Console, open each property and go to Settings → Users and permissions → Add user. Add the service-account email (`gsc-reader@YOUR_PROJECT_ID.iam.gserviceaccount.com`) with the Restricted role (read access). Adding a new site later is just one more grant here.

### 3. Install and register

```bash
npm install
claude mcp add gsc --scope user -- node "$PWD/mcp.mjs"
```

`--scope user` registers it for every Claude Code session on the machine. Restart the session (or start a new one) to pick up the tools.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GSC_KEY_PATH` | `~/.config/gsc-mcp/key.json` | Path to the service-account JSON key. |

## Using the same credential from other services

The MCP server is only for interactive clients. A background service (cron job, digest, monitor) can reuse the same service-account key and call the Search Console API directly. Nothing in this repo needs to change to support that; both are independent consumers of one credential.

## Deploying as a hosted service

To run this as an always-on remote MCP instead of a local stdio process, containerize it, expose it over HTTP/SSE behind a reverse proxy with auth, mount the key as a secret, and register the remote URL with the client. The core (`gsc.mjs`) is unchanged; only the transport and hosting differ.
