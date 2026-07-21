import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  ClientOnly,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppProviders } from "../providers/AppProviders";
import { Layout } from "../components/Layout";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "COTI Payroll — Private On-Chain HR Payroll" },
      {
        name: "description",
        content:
          "Encrypted payroll runs on Avalanche Fuji with COTI privacy. Create, fund, and claim payrolls without exposing salary amounts on-chain.",
      },
      { name: "author", content: "COTI Payroll" },
      { property: "og:title", content: "COTI Payroll — Private On-Chain HR Payroll" },
      {
        property: "og:description",
        content:
          "Encrypted payroll runs on Avalanche Fuji with COTI privacy. Create, fund, and claim payrolls without exposing salary amounts on-chain.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "COTI Payroll — Private On-Chain HR Payroll" },
      { name: "twitter:description", content: "Encrypted payroll runs on Avalanche Fuji with COTI privacy. Create, fund, and claim payrolls without exposing salary amounts on-chain." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/95dd7446-0f6a-4bab-8592-c6e210cc7bc8/id-preview-ee6349aa--188affd3-5a0b-4a37-b760-1185f4c984e0.lovable.app-1784554597655.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/95dd7446-0f6a-4bab-8592-c6e210cc7bc8/id-preview-ee6349aa--188affd3-5a0b-4a37-b760-1185f4c984e0.lovable.app-1784554597655.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/coti-favicon.png", type: "image/png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function LoadingShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

function RootComponent() {
  // Select just queryClient instead of destructuring the whole context object.
  // useRouteContext() without a selector re-renders on every navigation (the
  // router builds a fresh merged context per match), which cascaded down through
  // AppProviders into wagmi's WagmiProvider on every route change. wagmi's own
  // Hydrate component reruns its non-SSR onMount() on every render it gets (not
  // just mount), and with reconnectOnMount:false that call wipes the wallet
  // connection with nothing to bring it back — the "loses connection on
  // navigation" bug. Selecting queryClient (a stable singleton) keeps this
  // component, and everything under it, from re-rendering on navigation at all.
  const queryClient = Route.useRouteContext({ select: (context) => context.queryClient });

  return (
    <QueryClientProvider client={queryClient}>
      <ClientOnly fallback={<LoadingShell />}>
        <AppProviders>
          <Layout>
            <Outlet />
          </Layout>
        </AppProviders>
      </ClientOnly>
    </QueryClientProvider>
  );
}
