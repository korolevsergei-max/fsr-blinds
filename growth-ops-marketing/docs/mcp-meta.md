# Custom Bridge Design: Meta Ads

## Why a Custom Bridge?
The Meta Graph API is notorious for its nested structure and rapidly deprecating versions. A custom MCP bridge encapsulates the Graph API logic, handling pagination, asset hashing, and error parsing natively. It provides the agent with clean, semantic tools rather than forcing the agent to construct complex `curl` requests with deeply nested JSON arrays.

## Minimum Tool List
- `meta_get_campaign_metrics`: Fetch delivery, spend, CPM, CPC, and ROAS metrics.
- `meta_upload_creative`: Upload images/videos to the Ad Account Asset Library and return the hash.
- `meta_draft_adset`: Build a campaign/adset/ad structure.

## Required Credentials
- `META_SYSTEM_USER_TOKEN`: Non-expiring system user access token.
- `META_AD_ACCOUNT_ID`: Target Ad Account (e.g., `act_123456789`).
- `META_BUSINESS_ID`: Business Manager ID.
- `META_APP_ID` & `META_APP_SECRET`: For API routing/versioning.

## Read-Only Actions
- Fetching Insights (metrics) across campaign, adset, and ad levels.
- Listing custom audiences and pixel events.
- Previewing ad creatives.

## Write Actions
- Uploading media assets.
- Creating Draft Campaigns, Adsets, and Ads.

## Safety / Approval Gates
- **Status Override**: All creations must be initialized with `status: PAUSED`.
- **Spending Limits**: Bridge must prevent any tool call that attempts to set an Adset daily budget above a hardcoded safety threshold (e.g., $50).
- **No Deletion**: The agent should not be given delete permissions. Only pause/draft actions are allowed.

## Smoke Test Plan
1. Connect using the System User token.
2. Call `meta_get_campaign_metrics` targeting the last 7 days.
3. Successfully return the account's total spend without modifying any entities.

## Recommended File Location
`growth-ops-marketing/src/mcp/bridges/meta-ads/`
