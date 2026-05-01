# Custom Bridge Design: Google Ads

## Why a Custom Bridge?
Google Ads is a high-risk financial environment. A CLI workflow relies on generic scripts that can easily run amok. An MCP custom bridge allows us to explicitly define exact capabilities, enforce hardcoded budget caps at the middleware layer, and translate the agent's intent directly into the complex Google Ads API schema safely.

## Minimum Tool List
- `gads_get_campaign_performance`: Fetch ROAS, CPA, Spend, and Impressions.
- `gads_list_campaigns`: Retrieve campaign structures and statuses.
- `gads_create_ad_draft`: Generate a new ad or campaign structure.

## Required Credentials
- `GADS_DEVELOPER_TOKEN`: Approved developer token.
- `GADS_CLIENT_ID` & `GADS_CLIENT_SECRET`: OAuth2 credentials.
- `GADS_REFRESH_TOKEN`: Long-lived OAuth token.
- `GADS_LOGIN_CUSTOMER_ID`: The Manager account ID.
- `GADS_TARGET_CUSTOMER_ID`: The specific ad account ID.

## Read-Only Actions
- Querying performance metrics via Google Ads Query Language (GAQL).
- Retrieving account hierarchy, budgets, and asset libraries.

## Write Actions
- Create campaigns, ad groups, and ads.
- Upload image or text assets.
- Adjust bids or budgets (subject to safety gates).

## Safety / Approval Gates
- **Status Override**: All creation actions (`gads_create_ad_draft`) MUST forcibly inject `status: PAUSED`. The agent cannot create active campaigns.
- **Budget Caps**: Write actions that modify budgets must have a hardcoded ceiling (e.g., max 10% daily increase or hard cap at $X/day).
- **Execution Gate**: Enabling a campaign requires a specific human-in-the-loop approval step that cannot be executed by the MCP server alone.

## Smoke Test Plan
1. Authenticate using the OAuth credentials and Developer Token.
2. Execute a GAQL query via `gads_list_campaigns` with a `LIMIT 1`.
3. Verify successful read without triggering any mutations.

## Recommended File Location
`growth-ops-marketing/src/mcp/bridges/google-ads/`
