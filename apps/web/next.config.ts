import type { NextConfig } from "next";

const IS_DEV = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Service worker must not be cached by the browser so updates are picked up immediately
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // PWA manifest
        source: "/manifest.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
    ];
  },
};

// Only apply Sentry's webpack plugin in production.
// In development its ESM helpers (_optionalChain, _nullishCoalesce) cause
// webpack to crash in a pnpm monorepo where @sentry/core resolves to the
// ESM build which does not re-export those symbols.
if (IS_DEV) {
  module.exports = nextConfig;
} else {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { withSentryConfig } = require("@sentry/nextjs");
  module.exports = withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: !process.env.SENTRY_AUTH_TOKEN,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    widenClientFileUpload: true,
    hideSourceMaps: true,
    disableLogger: true,
    automaticVercelMonitors: false,
  });
}
