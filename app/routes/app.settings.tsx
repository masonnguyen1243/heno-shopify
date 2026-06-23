import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { requireShopSession } from "../lib/auth.server";
import db from "../db.server";
import { CredentialForm } from "../components/CredentialForm";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShopSession(request);

  const merchant = await db.merchant.findUnique({
    where: { shopDomain: shop },
    include: { credential: { select: { id: true } } },
  });

  return { hasCredential: !!merchant?.credential };
};

export default function Settings() {
  const { hasCredential } = useLoaderData<typeof loader>();
  return <CredentialForm hasCredential={hasCredential} />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
