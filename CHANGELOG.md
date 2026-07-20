# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `datePreset` on `gsc_search_analytics` and `compare_search_performance`: a rolling window ending yesterday (`last_7_days`, `last_28_days`, `last_3_months`, `last_6_months`, `last_12_months`, `last_16_months`), so you do not have to compute start and end dates. It takes precedence over `days`; an explicit `startDate`/`endDate` still wins.

### Changed

- Automated GitHub Release notes now include a link to the full changelog.
- The release workflow skips publishing or creating a release if that version is already published or the release already exists, so re-runs and first-release bootstraps do not fail.

## [0.4.1] - 2026-07-20

### Added

- `CONTRIBUTING.md`, `ROADMAP.md`, GitHub issue templates (bug report and feature request), and a pull-request template.

### Changed

- The release workflow now creates a GitHub Release from the pushed tag, using that version's changelog section as the notes.
- README links to the contributing guide and roadmap.

## [0.4.0] - 2026-07-20

### Added

- New tool `compare_search_performance`: compares two date periods and returns clicks, impressions, CTR, and average position for each, plus the absolute and percentage change, computed in code. Optionally group by page, query, country, or device to get the biggest declines and gains. If the previous period is not given, it defaults to the equal-length window immediately before the current one. Filters, `searchType`, and `dataState` apply to both periods.

## [0.3.0] - 2026-07-20

Completes the `gsc_search_analytics` tool.

### Added

- Dimension `filters`: an array of `{ dimension, operator, expression }`, all combined with AND (operators: `equals`, `notEquals`, `contains`, `notContains`, `includingRegex`, `excludingRegex`; operator defaults to `equals`). `filterPage` still works and combines with them.
- `dataState` (`final` | `all`) and `aggregationType` (`auto` | `byProperty` | `byPage`).
- `siteUrl` accepted as an alias for `site`.
- Automatic pagination: `rowLimit` may exceed the API's 25,000-per-request limit and is fetched across pages, bounded by a configurable `maxRows` safety ceiling. `startRow` allows manual paging.
- Structured response: rows are now wrapped with metadata (`siteUrl`, `period`, `dimensions`, `searchType`, `dataState`, `aggregationType`, `startRow`, `rowCount`, `hasMore`, and `warnings`).

### Changed

- `gsc_search_analytics` now returns the metadata-wrapped object above instead of the raw Google API response. Rows remain under `rows`.
- The default `rowLimit` is now 1000 (was 100).

## [0.2.0] - 2026-07-20

First release published to npm as `@akashrajpurohit/gsc-mcp`.

### Added

- Executable CLI (`gsc-mcp`), runnable with `npx @akashrajpurohit/gsc-mcp` (no clone required).
  - `gsc-mcp` / `gsc-mcp serve`: start the MCP stdio server (default).
  - `gsc-mcp doctor`: diagnose your setup (Node version, credentials file, credentials JSON, Google authentication, Search Console API, accessible properties, and server startup).
  - `gsc-mcp --help` and `gsc-mcp --version`.
  - Convenience read commands for a quick manual check: `sites`, `queries`, `pages`, `perf`, `inspect`, `sitemaps`.
- Clear, early error when the Node.js version is below the supported minimum.
- Reliability baseline: a `node:test` suite covering every MCP tool, the API wrapper, argument validation, credential loading, the `doctor` diagnostic, the CLI, and simulated Google API failures. All offline, with no network and no real credentials required.
- GitHub Actions CI running the test suite on pushes and pull requests.
- Release automation via a tag-triggered publish workflow using npm trusted publishing (OIDC).
- Input validation on all MCP tools (dates, dimensions, `rowLimit`, `searchType`).
- Error sanitization so credential material can never appear in tool output, CLI errors, or logs.
- `SECURITY.md` describing the security and privacy model, and a demo recording in the README.

### Changed

- Package renamed to `@akashrajpurohit/gsc-mcp` for scoped publishing.
- The single `bin` is now `gsc-mcp` (previously `gsc`).
- Credentials are read and validated up front, producing clear, secret-free errors.

### Removed

- The standalone `cli.mjs`; its commands are now part of the `gsc-mcp` binary.

## [0.1.0] - 2026-06-29

### Added

- Initial MCP server exposing four read-only Google Search Console tools: `gsc_list_sites`, `gsc_search_analytics`, `gsc_inspect_url`, and `gsc_list_sitemaps`.

[Unreleased]: https://github.com/AkashRajpurohit/gsc-mcp/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/AkashRajpurohit/gsc-mcp/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/AkashRajpurohit/gsc-mcp/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/AkashRajpurohit/gsc-mcp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/AkashRajpurohit/gsc-mcp/releases/tag/v0.2.0
