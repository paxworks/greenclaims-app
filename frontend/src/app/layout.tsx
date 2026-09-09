import type { Metadata } from "next";
import Script from "next/script";
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
        {/*
          Shopify opens the App URL top-level (not inside the admin iframe)
          on first load after install/reinstall — it passes shop/host/hmac
          but does NOT embed us automatically. App Bridge's global script
          does not do this redirect on its own; without it, the page loads
          standalone and window.shopify.idToken() never becomes available.
          Detect top-level + shop param and bounce into the embedded admin
          ourselves, before anything else runs.
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
        {/* App Bridge must load before any other script in the embedded admin iframe. */}
        <meta name="shopify-api-key" content={SHOPIFY_API_KEY} />
        <Script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" strategy="beforeInteractive" />
      </head>
      <body className="bg-[#f6f6f7]">
        {children}
        <footer className="mx-auto max-w-5xl px-6 pb-8 pt-4">
          <p className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Data retention: uninstalling this app deletes all associated data — scanned products,
            claims, and uploaded evidence — within 48 hours, per Shopify&apos;s mandatory deletion
            policy. There is no grace period, so download any evidence packs you need before
            uninstalling. Full privacy policy: paxworks.io/greenclaims-privacy (coming in phase 7).
          </p>
        </footer>
      </body>
    </html>
  );
}
