#!/bin/bash
echo "Enter Shopify Store URL (e.g. my-store.myshopify.com):"
read store
shopify auth login --store $store
