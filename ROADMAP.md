# Roadmap

gsc-mcp is a read-only MCP server for Google Search Console. It stays small, local, and dependable. This is a rough guide to direction, not a promise of dates.

## Done

- Reliable test suite and CI.
- npx install, the `gsc-mcp` CLI, and a `doctor` diagnostic.
- Full Search Analytics query tool: filters, date ranges, pagination, and structured metadata.
- `compare_search_performance` for period-over-period analysis.
- Contributor docs, issue and pull-request templates, and a security policy.

## Considering

These fit the project's read-only, local, and deterministic goals, roughly in order of interest:

- Date presets such as `last_7_days` and `last_28_days`.
- Batch URL inspection with a concurrency limit.
- Clearer, quota-aware API error messages.
- Request timeouts and simple retry with backoff.
- More deterministic analyses: declining pages, CTR opportunities, and striking-distance queries.
- A Docker image.
- Optional OAuth as an alternative to a service-account key.
- A listing in the MCP registry.

## Not planned

To keep the project focused, these are out of scope for now:

- Write access to Search Console, URL indexing, or sitemap changes.
- Hosted accounts, dashboards, databases, or a web UI.
- Analytics or telemetry.
- GA4, Bing, or other non-Search-Console integrations.
- AI-generated SEO advice inside the server. The client stays responsible for explanation and recommendations.

Have an idea? Open a feature request.
