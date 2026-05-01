# Custom Bridge Design: Klaviyo

## Why a Custom Bridge?
Email Service Providers require strict adherence to their specific payload formats for templates, lists, and profiles. A custom MCP bridge allows the agent to construct complex HTML templates natively, test them locally, and push them to Klaviyo as drafts without risking malformed API payloads via raw CURL. It also safely abstracts PII handling.

## Minimum Tool List
- `klaviyo_get_list_metrics`: Retrieve list sizes, open rates, and click rates.
- `klaviyo_draft_campaign`: Create a new email/SMS campaign.
- `klaviyo_update_template`: Push HTML changes to a specific email template.

## Required Credentials
- `KLAVIYO_PRIVATE_API_KEY`: Full access private key (restricted to necessary scopes).
- `KLAVIYO_PUBLIC_API_KEY`: For client-side simulation (optional).

## Read-Only Actions
- Querying campaign performance (Sends, Opens, Clicks, Bounces).
- Looking up Segment/List sizes.
- Retrieving existing HTML templates for local review.

## Write Actions
- Creating Draft Campaigns.
- Updating HTML content of templates.
- (Optional/Restricted) Adding specific profiles to a list.

## Safety / Approval Gates
- **Send Lock**: The bridge MUST NOT expose the Klaviyo `Send Campaign` endpoint. All campaigns are created as Drafts to be manually reviewed and scheduled in the Klaviyo UI.
- **PII Scrubbing**: Responses containing Profile data should scrub sensitive PII if the agent does not strictly need it for the specific task.

## Smoke Test Plan
1. Authenticate with Private API Key.
2. Call `klaviyo_get_list_metrics` for the main "Newsletter" list.
3. Validate that a list ID and size are returned successfully without modifying the list.

## Recommended File Location
`growth-ops-marketing/src/mcp/bridges/klaviyo/`
