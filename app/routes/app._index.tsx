import { redirect } from "react-router";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = ({ request }: LoaderFunctionArgs) => {
  // Preserve shop/host/embedded/id_token params so downstream routes can authenticate
  const { searchParams } = new URL(request.url);
  return redirect(`/app/settings?${searchParams.toString()}`);
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
