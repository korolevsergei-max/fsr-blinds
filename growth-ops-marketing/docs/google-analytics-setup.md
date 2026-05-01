# Google Analytics MCP Setup Guide

To enable Google Analytics automation via MCP, follow these steps:

## 1. Google Cloud Configuration
1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a new project (e.g., `Antigravity Marketing`).
3.  Enable the following APIs:
    - **Google Analytics Data API**
    - **Google Analytics Admin API**
4.  Create a **Service Account**:
    - Navigate to **IAM & Admin > Service Accounts**.
    - Create a service account and name it (e.g., `ga-mcp-agent`).
    - Grant no specific project-level roles unless needed for other tasks.
    - Create a **JSON Key** for this service account and download it.

## 2. Google Analytics Configuration
1.  Open your [Google Analytics Admin](https://analytics.google.com/).
2.  Go to **Property Settings > Property Access Management**.
3.  Click the `+` button and add the service account email (from the JSON key).
4.  Assign the **Viewer** role (for read-only access).
5.  Note your **Property ID** (found in **Property Settings**).

## 3. Environment Setup
Update the `mcp_config.json` or your `.env` file with the following:
- `GOOGLE_CLIENT_EMAIL`: Found in your JSON key as `client_email`.
- `GOOGLE_PRIVATE_KEY`: Found in your JSON key as `private_key`.
- `GA_PROPERTY_ID`: Your Google Analytics 4 Property ID.

## 4. Verification
Once credentials are set, Antigravity will be able to:
- List accounts and properties.
- Pull traffic reports (Pageviews, Users, Sessions).
- Analyze conversion data.

---
*Status: BLOCKED (Awaiting Credentials)*
