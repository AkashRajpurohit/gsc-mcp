# Security & Privacy

`gsc-mcp` is designed to be safe by construction. This document explains the model and how to report a vulnerability.

## Security model

### Read-only by scope

The server authenticates with Google's read-only Search Console scope (`https://www.googleapis.com/auth/webmasters.readonly`). It cannot submit sitemaps, change settings, add or remove properties, or modify your account in any way. The credential itself is incapable of writing, not merely restricted by convention.

### Local and self-contained

The server runs as a local stdio process on your own machine. Data flows only between your machine and Google's API. There is no third-party server in the middle, no hosted component, and no account system.

### No telemetry

The project collects no analytics or telemetry of any kind. There is nothing to phone home, and no usage data is gathered or transmitted.

### Credential handling

- Your service-account key is a file you create and control (default `~/.config/gsc-mcp/key.json`, or wherever `GSC_KEY_PATH` points).
- The key is read locally and passed only to Google's authentication libraries. It is never sent anywhere else.
- The repository's `.gitignore` blocks `*key*.json` so a key cannot be committed by accident.
- All error messages are passed through a sanitizer before they leave the server (as MCP tool output, CLI errors, or `doctor` output). Private-key blocks and token-like fields are redacted so credential material cannot leak into logs or transcripts.

### Minimal dependencies

The project depends only on the official MCP SDK and Google's API client. Tests use Node's built-in test runner, so no additional runtime or development dependencies are introduced.

## What leaves your machine

- To Google: authenticated, read-only Search Console API requests for the data you ask for.
- To anyone else: nothing.

## Verify your setup

Run the built-in diagnostic to confirm your configuration without exposing any secrets:

```bash
npx @akashrajpurohit/gsc-mcp doctor
```

## Reporting a vulnerability

Please report suspected vulnerabilities privately rather than opening a public issue:

- Use GitHub's [private vulnerability reporting](https://github.com/AkashRajpurohit/gsc-mcp/security/advisories/new), or
- Email me@akashrajpurohit.com.

Please include steps to reproduce and the affected version. You will receive an acknowledgement, and a fix or mitigation will be worked on as quickly as is practical.

## Supported versions

This project is pre-1.0 and under active development. Security fixes are applied to the latest released version.
