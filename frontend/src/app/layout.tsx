import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Green Claims",
  description: "Green Claims Substantiation Manager — by Paxworks",
};

const SHOPIFY_API_KEY = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || "";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="shopify-api-key" content={SHOPIFY_API_KEY} />
        {/*
          App Bridge enforces this itself and aborts its own init if
          violated: this must be the literal first <script> tag in the
          document, plain (no async/defer/type=module), linking directly to
          Shopify's CDN. next/script's <Script strategy="beforeInteractive">
          adds `async` under the hood, which made App Bridge silently abort
          — window.shopify never initialized no matter what else was fixed
          (CSP, timing, redirect_uri). Must stay a plain native tag.
        */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
        {/*
          Shopify opens the App URL top-level (not inside the admin iframe)
          on first load after install/reinstall — it passes shop/host/hmac
          but does NOT embed us automatically. Detect top-level + shop param
          and bounce into the embedded admin ourselves.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  if (window.top === window.self) {
                    var params = new URLSearchParams(window.location.search);
                    var shop = params.get('shop');
                    var apiKey = '${SHOPIFY_API_KEY}';
                    if (shop && apiKey) {
                      window.top.location.href = 'https://' + shop + '/admin/apps/' + apiKey;
                    }
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="bg-[#f6f6f7]">{children}</body>
    </html>
  );
}
