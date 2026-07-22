# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.1] - 2026-07-22

### Fixed

- The default key path now resolves through `os.homedir()` and `path.join()` instead of `$HOME`, so it works on Windows, where `HOME` is unset.

### Changed

- Tool input schemas now declare their numeric bounds (`minimum`, `maximum`, `exclusiveMinimum`), date formats, and non-empty array requirements, so a client can see the constraints the server already enforced. No accepted input changed.
- The striking-distance and low-CTR defaults quoted in the `find_seo_opportunities` schema are now interpolated from the shared constants instead of being written out by hand, so the documented defaults cannot drift from the implemented ones.
- CI now runs the test suite on Node 22.x as well as 24.x, so the declared `engines` floor of >=22.5 is actually verified.

### Added

- A schema conformance test that feeds every declared bound a violating value and asserts the runtime validators reject it, keeping the two layers in agreement.

## [1.0.0] - 2026-07-20

First stable release. The seven tools and their input and output shapes are now considered stable.

### Changed

- Declared a stable public API: the tool names and their inputs and outputs follow semantic versioning, with breaking changes reserved for future major releases. The server remains read-only.

## [0.9.0] - 2026-07-20

### Added

- New tool `gsc_inspect_urls`: batch URL inspection with bounded concurrency. Inspects many URLs in one call and returns a compact index status per URL (verdict, coverage state, indexing state, canonical, last crawl). An individual URL that fails is reported with an error field without failing the whole batch. Tunable with `concurrency` (default 5, max 10) and `maxUrls` (default 50).

## [0.8.0] - 2026-07-20

### Added

- Network resilience: every Google API call now has a per-request timeout and automatically retries transient failures (HTTP 429 and 5xx, plus dropped connections) with exponential backoff and jitter. Permanent errors still fail fast. Configurable with `GSC_TIMEOUT_MS`, `GSC_MAX_RETRIES`, and `GSC_RETRY_BASE_MS`.

## [0.7.0] - 2026-07-20

### Added

- New tool `find_seo_opportunities`: surfaces quick wins from Search Console data, computed in code and ranked by impressions. `striking_distance` (default) finds queries or pages ranking just off page 1; `low_ctr` finds page-1 queries or pages with a low click-through rate. Tunable with `minImpressions`, position range, `maxCtr`, `dimension`, and `limit`.

## [0.6.0] - 2026-07-20

### Added

- Tool errors now include a short, actionable hint for common failures (quota or rate limits, a property the service account cannot read, a disabled API, authentication problems, and network issues), alongside the original message. Credential material is still never leaked.

### Changed

- Reorganized the source into focused modules under `lib/` (tools, analytics, compare, server, and a `util/` folder for constants, dates, validation, and errors). No behavior change.
- `npm version` now checks that the CHANGELOG has a section for the new version, so a release cannot be tagged without its changelog entry.

## [0.5.0] - 2026-07-20

### Added

- `datePreset` on `gsc_search_analytics` and `compare_search_performance`: a rolling window ending yesterday (`last_7_days`, `last_28_days`, `last_3_months`, `last_6_months`, `last_12_months`, `last_16_months`), so you do not have to compute start and end dates. It takes precedence over `days`; an explicit `startDate`/`endDate` still wins.

### Changed

- Automated GitHub Release notes now include a link to the full changelog.
- The release workflow skips publishing or creating a release if that version is already published or the release already exists, so re-runs and first-release bootstraps do not fail.
- The release workflow now fails if the pushed tag does not match the version in package.json.

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

[Unreleased]: https://github.com/AkashRajpurohit/gsc-mcp/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/AkashRajpurohit/gsc-mcp/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/AkashRajpurohit/gsc-mcp/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/AkashRajpurohit/gsc-mcp/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/AkashRajpurohit/gsc-mcp/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/AkashRajpurohit/gsc-mcp/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/AkashRajpurohit/gsc-mcp/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/AkashRajpurohit/gsc-mcp/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/AkashRajpurohit/gsc-mcp/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/AkashRajpurohit/gsc-mcp/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/AkashRajpurohit/gsc-mcp/compare/v0.2.0...v0.3.0
