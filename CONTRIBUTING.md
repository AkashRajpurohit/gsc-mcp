# Contributing

Thanks for your interest in gsc-mcp. It is a small, focused project, and contributions are welcome.

## What this project is

gsc-mcp is a read-only MCP server for Google Search Console. It aims to be dependable, easy to install, and safe. A few principles guide it:

- Read-only. It never writes to Search Console.
- Small and reliable. A few solid tools beat many thin ones.
- Minimal dependencies. Only the MCP SDK and Google's API client at runtime.
- Predictable output that works for both people and AI agents.
- No telemetry, accounts, or hosted services.

If you have an idea that changes this direction, please open an issue first so we can talk it through. See [ROADMAP.md](ROADMAP.md) for what is and is not planned.

## Development setup

You need Node.js 22.5 or newer.

```bash
git clone https://github.com/AkashRajpurohit/gsc-mcp.git
cd gsc-mcp
npm install
npm test
```

Tests use Node's built-in runner and are fully offline. They do not need Google credentials and do not touch the network, so `npm test` works on a clean checkout.

## Testing against a real client

Point your MCP client at your local checkout instead of the npm package. For Claude Code:

```bash
claude mcp add gsc --scope user -- node /absolute/path/to/gsc-mcp/bin/gsc-mcp.mjs
```

There is no build step. After you edit code, reconnect the server so it re-reads the files (in Claude Code, run `/mcp`). You can also run the CLI directly against your own account:

```bash
node bin/gsc-mcp.mjs doctor
node bin/gsc-mcp.mjs sites
```

## Project layout

| Path | Responsibility |
|------|----------------|
| `lib/gsc.mjs` | Google API client: credential loading and read-only Search Console calls. |
| `lib/mcp.mjs` | MCP server, tool definitions, input validation, error sanitization. |
| `lib/doctor.mjs` | The `gsc-mcp doctor` diagnostic. |
| `bin/gsc-mcp.mjs` | Executable entry point (server plus `doctor`, `--help`, `--version`, and read commands). |
| `test/` | Offline test suite. |

## Guidelines

- Add or update tests for any change in behavior. Keep tests offline and mock the Google responses.
- Validate tool inputs and return clear errors. Never let credential material reach output or logs.
- Keep the code simple and match the style already there.
- Update the README and CHANGELOG when behavior changes.
- Keep each change small and focused so it is easy to review.

## Pull requests

- Describe what the change does and why, and link any related issue.
- Make sure `npm test` passes.
- Prefer one logical change per pull request.

## Releases

To cut a release, add a `## [X.Y.Z]` section to `CHANGELOG.md`, then run `npm version <patch|minor|major>` and push with `git push origin main --follow-tags`.

`npm version` checks that the CHANGELOG has a section for the new version, bumps `package.json`, commits, and creates a matching tag, so the tag and the version can never disagree. The pushed tag runs the publish workflow, which also fails if the tag does not match `package.json`, then tests, publishes to npm with trusted publishing (OIDC), and creates a GitHub Release. No tokens are stored, and provenance is attached automatically.

To sign the tag, run `npm config set sign-git-tag true` once.
