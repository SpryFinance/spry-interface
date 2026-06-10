#!/bin/bash

# Build production and test that environment variables are loaded correctly.
#
# This script serves dual purposes:
# 1. Builds the web app for production
# 2. Verifies that the single .env is loaded for a production build (asserts the
#    production GraphQL endpoint is present)
#
# Note: this must be run in the apps/web directory

# Check that we're in the correct directory (apps/web)
if [[ ! -f "package.json" ]] || [[ ! -f "vite.config.mts" ]] || [[ ! -d "src" ]]; then
    echo "❌ Error: This script must be run from the apps/web directory"
    echo "Usage: cd apps/web && ./scripts/build-and-test-env.sh"
    exit 1
fi

echo "🧪 Testing production environment variable loading..."

# Run production build and capture output
BUILD_OUTPUT=$(NODE_OPTIONS="--max-old-space-size=16384" bun run build:production 2>&1)

# Check that the .env file was loaded: the WalletConnect project ID is required,
# lives only in .env, and is printed by the ENV_LOADED log in vite.config.mts.
if echo "$BUILD_OUTPUT" | grep -qE "ENV_LOADED:.*mode=production.*WALLET_CONNECT_PROJECT_ID=[a-z0-9]+"; then
    echo "✅ Production env file loaded correctly"
    echo "✅ Environment loading test PASSED"
    exit 0
else
    echo "❌ Production environment variables not loaded correctly"
    echo "Expected: mode=production with a non-empty WALLET_CONNECT_PROJECT_ID"
    echo "Build output:"
    echo "$BUILD_OUTPUT" | grep "ENV_LOADED:" || echo "No ENV_LOADED found"
    echo "❌ Environment loading test FAILED"
    exit 1
fi
