# Antigravity Growth Ops & Marketing Workspace

This workspace is a dedicated environment for digital marketing automation, storefront orchestration, and agentic growth workflows.

## 🚀 Installed Toolchain
The core automation engine is powered by:
- **Codex CLI**: Local AI agent for code and shell interaction.
- **Claude Code**: High-fidelity autonomous coding and reasoning.
- **Playwright**: Robust browser automation and web scraping.
- **Shopify CLI**: Theme and storefront development engine.
- **MCP Servers**: Registered servers for Playwright and Google Analytics.

## 🔑 Required Credentials
The following are needed to unlock full automation:
1. **Shopify Auth**: Run `./scripts/shopify/login.sh` manually once.
2. **Google Analytics**: Requires Service Account JSON key and Property ID. [See Setup Guide](docs/google-analytics-setup.md).
3. **OpenAI / Anthropic Keys**: To be added to a local `.env` file.
4. **Storefront URL**: Target `.myshopify.com` domain.

## 🛠 Run Order
1. **Bootstrap**: `npm install` to ensure local Playwright dependencies.
2. **Smoke Test**: `node playwright/smoke/smoke.js` to verify browser health.
3. **Shopify Login**: Authenticate the CLI with your store.
4. **GA Setup**: Follow [GA Setup Guide](docs/google-analytics-setup.md) to add credentials to `mcp_config.json`.
5. **Agent Activation**: Configure Claude Code / Codex for the project.

## 🛡 Safe Defaults
To ensure brand safety and prevent accidental deployments:
- **No Production Publish**: All theme changes must be previewed in dev themes.
- **No Live Ads Launch**: Ad campaign drafts are created but never set to "Active" automatically.
- **No Live Email Send**: Campaigns are drafted in the ESP (e.g., Klaviyo) but require manual trigger.
- **No Listing Edits**: Product descriptions or price changes require explicit manual approval.

## 🤖 MCP Registration Status
- [x] **Playwright MCP**: Registered and verified.
- [x] **Google Analytics MCP**: Registered (Status: **BLOCKED** pending credentials).
- [ ] **Shopify MCP**: Programmatic product/order management (Next Step).
- [ ] **Search Console MCP**: SEO data and index monitoring (Next Step).

---
*Created by Antigravity AI*

