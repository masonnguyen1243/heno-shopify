import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { requireShopSession } from "../lib/auth.server";
import { sanitizeForLog } from "../lib/logger.server";
import db from "../db.server";
import { CredentialForm } from "../components/CredentialForm";
import {
  verifyCredentials,
  InvalidCredentialsError,
  TingeeConnectionError,
} from "../services/tingee.server";
import { saveCredential, hasCredential, deleteCredential } from "../services/credential.server";
import { registerPaymentMethod, unregisterPaymentMethod } from "../services/order.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, shop } = await requireShopSession(request);

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "save");

  if (intent === "delete") {
    try {
      await unregisterPaymentMethod(session.shop, session.accessToken!);
    } catch (error) {
      console.error(
        "Unregister payment method failed",
        sanitizeForLog({
          shop,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
      );
      return { error: "PAYMENT_METHOD_UNREGISTRATION_FAILED" };
    }
    try {
      await deleteCredential(shop);
    } catch (error) {
      console.error(
        "Delete credential failed after payment method unregistered",
        sanitizeForLog({
          shop,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
      );
      return { error: "CREDENTIAL_DELETION_FAILED" };
    }
    return { deleted: true };
  }

  const clientId = String(formData.get("clientId") ?? "").trim();
  const secretToken = String(formData.get("secretToken") ?? "").trim();

  if (!clientId || !secretToken) {
    return { error: "MISSING_FIELDS" };
  }

  if (clientId.length > 255 || secretToken.length > 255) {
    return { error: "MISSING_FIELDS" };
  }

  const isFirstSave = !(await hasCredential(shop));

  try {
    await verifyCredentials(clientId, secretToken);
    await saveCredential(shop, clientId, secretToken);
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return { error: "INVALID_CREDENTIALS" };
    }
    if (error instanceof TingeeConnectionError) {
      return { error: "TINGEE_TIMEOUT" };
    }
    console.error(
      "Credential save failed",
      sanitizeForLog({
        shop,
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    );
    return { error: "UNKNOWN" };
  }

  if (isFirstSave) {
    try {
      await registerPaymentMethod(session.shop, session.accessToken!);
    } catch (error) {
      console.error(
        "Payment method registration failed",
        sanitizeForLog({
          shop,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
      );
      return { error: "PAYMENT_METHOD_REGISTRATION_FAILED" };
    }
  }

  return { success: true };
};

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
