# Custom Bridge Design: Google Search Console (GSC)

## Why a Custom Bridge?
While CLI tools exist for Google APIs, SEO and content planning require the agent to dynamically explore multidimensional data (e.g., pivoting by query, page, device, and date). A custom MCP bridge allows the agent to iteratively reason over Search Console data, map it against local content files, and perform targeted URL inspections programmatically without complex bash scripting.

## Minimum Tool List
- `gsc_get_performance`: Fetch clicks, impressions, CTR, and position (grouped by date, query, or page).
- `gsc_inspect_url`: Check index status, mobile usability, and canonical tags for a specific URL.
- `gsc_list_sitemaps`: Retrieve submitted sitemaps and their processing status.

## Required Credentials
- `GOOGLE_SERVICE_ACCOUNT_JSON`: Full JSON key file for an authorized service account.
- `GSC_SITE_URL`: The exact property URL (e.g., `sc-domain:example.com` or `https://example.com/`).

## Read-Only Actions
- Querying search analytics data.
- Inspecting URL indexation status.
- Listing sitemaps and crawling errors.

## Write Actions
- Submit a new sitemap ping (e.g., `gsc_submit_sitemap`).

## Safety / Approval Gates
- **Low Risk**: The GSC API is primarily read-only.
- **Gate**: Rate limiting must be strictly enforced in the bridge to prevent quota exhaustion from agent loops.

## Smoke Test Plan
1. Connect using the service account credentials.
2. Call `gsc_get_performance` for the last 3 days grouped by `date`.
3. Assert that a valid JSON response with impressions/clicks is returned.

## Recommended File Location
`growth-ops-marketing/src/mcp/bridges/gsc/`
