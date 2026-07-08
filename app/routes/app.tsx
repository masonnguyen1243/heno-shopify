import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
// @ts-expect-error — Polaris locale JSON has no .d.ts; Vite handles JSON imports natively
import enTranslations from "@shopify/polaris/locales/en.json";

import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // eslint-disable-next-line no-undef
  console.log("[DEBUG] SHOPIFY_APP_URL =", process.env.SHOPIFY_APP_URL);
  let session;
  try {
    ({ session } = await authenticate.admin(request));
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      const reauthUrl = error.headers.get(
        "X-Shopify-API-Request-Failure-Reauthorize-Url"
      );
      if (reauthUrl) {
        throw redirect(
          `/auth/exit-iframe?${new URLSearchParams({ exitIframe: reauthUrl })}`
        );
      }
    }
    throw error;
  }

  if (!session?.shop) throw redirect("/auth");

  await db.merchant.upsert({
    where: { shopDomain: session.shop },
    update: { uninstalledAt: null },
    create: { shopDomain: session.shop, installedAt: new Date() },
  });

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisProvider i18n={enTranslations}>
        <s-app-nav>
          <s-link href="/app">Home</s-link>
        </s-app-nav>
        <Outlet />
      </PolarisProvider>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
