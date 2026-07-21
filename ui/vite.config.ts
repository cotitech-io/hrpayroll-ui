// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     VITE_* env injection, @ path alias, React/TanStack dedupe, error logger plugins, and
//     sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // No server-side code (no createServerFn / server routes) and every route is a static
  // path, so the app fully prerenders to static HTML — deployed as a plain static site
  // (S3 + CloudFront) rather than a Cloudflare Worker. `nitro: false` drops the
  // nitro/cloudflare deploy plugin entirely; output goes to dist/client via TanStack
  // Start's own default (nitro-less) vite adapter.
  nitro: false,
  tanstackStart: {
    prerender: { enabled: true, crawlLinks: true },
  },
});
