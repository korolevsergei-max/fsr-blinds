# Shopify CLI Setup & Workflow

This document outlines the workflow for storefront and theme development using Shopify CLI.

## 1. Authentication
To authenticate with your Shopify account:
```bash
shopify auth login --store <YOUR_STORE_URL>
```
*Note: This will open a browser window for authentication.*

## 2. Connecting to a Store
Ensure you have the store URL (e.g., `your-store.myshopify.com`). You can set the default store using:
```bash
shopify config set --store <YOUR_STORE_URL>
```

## 3. Theme Development Workflow

### Pulling the Latest Theme
To pull the current live theme (or a specific theme ID):
```bash
shopify theme pull --path ./theme
```

### Local Development / Preview
To start a local development server with live reload:
```bash
shopify theme dev --path ./theme
```
*Note: This creates a development theme on the store that is hidden from customers.*

### Validation & Linting
To check for best practices and errors:
```bash
shopify theme check ./theme
```

## 4. Common Commands Wrapper
We have provided convenience scripts in `scripts/shopify/`:
- `login.sh`: Authenticates the CLI.
- `pull.sh`: Downloads the theme.
- `dev.sh`: Starts the local dev server.
- `check.sh`: Runs the linter.

## 5. Required Credentials
To proceed with automation, we need:
1. **Store URL**: (e.g., `fsr-blinds.myshopify.com`)
2. **Access Scopes**: Ensure your staff account has "Themes" and "Products" permissions.
