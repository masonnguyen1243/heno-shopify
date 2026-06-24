import "@shopify/polaris/build/esm/styles.css";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { addDocumentResponseHeaders } from "./shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const headers = new Headers();
  addDocumentResponseHeaders(request, headers);
  return data(null, { headers });
};

export const headers: HeadersFunction = ({ loaderHeaders }) => {
  return loaderHeaders;
};

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
        <style>{`
          :root {
            --p-color-bg-fill-brand: #e12a41;
            --p-color-bg-fill-brand-hover: #c4223a;
            --p-color-bg-fill-brand-active: #a81b30;
          }
        `}</style>
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
