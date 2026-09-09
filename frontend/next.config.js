/** @type {import('next').NextConfig} */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "https://greenclaims-api.paxworks.io";

const nextConfig = {
  outputFileTracingRoot: require('path').join(__dirname, '../../'),
  trailingSlash: false,
  // Shopify requires the OAuth redirect_uri to share the same host as the
  // App URL ("The redirect_uri and application url must have matching
  // hosts") — but our backend lives on a separate subdomain
  // (greenclaims-api.paxworks.io). Proxy /auth/* through this domain
  // transparently so Shopify only ever sees one host, while the real work
  // still happens on the FastAPI backend. Same pattern billing-app uses
  // for its own API proxying.
  async rewrites() {
    return [
      {
        source: "/auth/:path*",
        destination: `${API_BASE_URL}/auth/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // No X-Frame-Options here — this app is embedded in the Shopify
          // admin iframe, so frame-ancestors below (not X-Frame-Options,
          // which can't express Shopify's per-shop origins) controls framing.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://cdn.shopify.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https://*.r2.dev https://pub-*.r2.dev",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://greenclaims-api.paxworks.io https://fonts.googleapis.com",
              // Required for embedding: only Shopify admin and the installing
              // shop's own admin domain may frame this app.
              "frame-ancestors https://admin.shopify.com https://*.myshopify.com",
              "form-action 'self'",
              "base-uri 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
