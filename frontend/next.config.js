/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: require('path').join(__dirname, '../../'),
  trailingSlash: false,
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
              // admin.shopify.com and the shop's own *.myshopify.com are
              // required here (not just script-src) for App Bridge's own
              // internal session/token machinery to work — without them,
              // window.shopify silently never initializes even though the
              // page is genuinely embedded.
              "connect-src 'self' https://greenclaims-api.paxworks.io https://fonts.googleapis.com https://admin.shopify.com https://*.myshopify.com",
              // Required for embedding: only Shopify admin and the installing
              // shop's own admin domain may frame this app.
              "frame-ancestors https://admin.shopify.com https://*.myshopify.com",
              // App Bridge uses hidden iframes internally for its own
              // session bridging — same domains as frame-ancestors above.
              "frame-src https://admin.shopify.com https://*.myshopify.com",
              "form-action 'self'",
              "base-uri 'self'",
            ].join("; "),
          },
        ],
      },
      {
        // "/" is statically prerendered, so Next's default long s-maxage
        // Cache-Control would let Railway's edge proxy serve a cached hit
        // straight from cache. DashboardClient's App Bridge session-token
        // calls are inherently per-visit, so this route can't be cached
        // at any shared layer.
        source: "/",
        headers: [{ key: "Cache-Control", value: "private, no-store, must-revalidate" }],
      },
    ];
  },
};
module.exports = nextConfig;
