import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirectDocument, useActionData, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

// login() throws a 302 redirect to accounts.shopify.com or admin.shopify.com/oauth/install.
// Both URLs block iframe embedding. This helper intercepts that redirect and converts it
// to an exit-iframe redirect so App Bridge can break out of the Shopify Admin iframe first.
async function loginWithExitIframe(request: Request) {
  try {
    return loginErrorMessage(await login(request));
  } catch (error) {
    if (error instanceof Response && (error.status === 301 || error.status === 302)) {
      const oauthUrl = error.headers.get("Location");
      if (oauthUrl) {
        // redirectDocument forces a full page navigation instead of SPA client-side
        // redirect, so the browser actually executes the App Bridge HTML that
        // renderAppBridge returns.
        throw redirectDocument(
          `/auth/exit-iframe?${new URLSearchParams({ exitIframe: oauthUrl })}`
        );
      }
    }
    throw error;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = await loginWithExitIframe(request);
  return { errors };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = await loginWithExitIframe(request);
  return { errors };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  return (
    <AppProvider embedded={false}>
      <s-page>
        <Form method="post">
        <s-section heading="Log in">
          <s-text-field
            name="shop"
            label="Shop domain"
            details="example.myshopify.com"
            value={shop}
            onChange={(e) => setShop(e.currentTarget.value)}
            autocomplete="on"
            error={errors.shop}
          ></s-text-field>
          <s-button type="submit">Log in</s-button>
        </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
