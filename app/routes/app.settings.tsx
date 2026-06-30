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
  fetchTingeeAccounts,
  InvalidCredentialsError,
  TingeeConnectionError,
} from "../services/tingee.server";
import { saveCredential, deleteCredential } from "../services/credential.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireShopSession(request);

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "save");

  if (intent === "delete") {
    try {
      await deleteCredential(shop);
    } catch (error) {
      console.error(
        "Delete credential failed",
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

  // Verify credentials then fetch the merchant's VA accounts from Tingee
  if (intent === "verify") {
    try {
      await verifyCredentials(clientId, secretToken);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        return { error: "INVALID_CREDENTIALS" };
      }
      if (error instanceof TingeeConnectionError) {
        return { error: "TINGEE_TIMEOUT" };
      }
      return { error: "UNKNOWN" };
    }
    const accounts = await fetchTingeeAccounts(clientId, secretToken);
    return { verified: true, accounts };
  }

  // intent === "save": save credentials + selected account
  const accountNumber = String(formData.get("accountNumber") ?? "").trim();
  const vaAccountNumber = String(formData.get("vaAccountNumber") ?? "").trim();
  const bankBin = String(formData.get("bankBin") ?? "").trim();
  const bankName = String(formData.get("bankName") ?? "").trim();

  if (!accountNumber || !vaAccountNumber || !bankBin) {
    return { error: "MISSING_ACCOUNT" };
  }

  try {
    await verifyCredentials(clientId, secretToken);
    await saveCredential(shop, clientId, secretToken, { accountNumber, vaAccountNumber, bankBin, bankName });
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

  return { success: true };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShopSession(request);

  const merchant = await db.merchant.findUnique({
    where: { shopDomain: shop },
    include: {
      credential: {
        select: {
          id: true,
          accountNumber: true,
          bankBin: true,
          bankName: true,
        },
      },
    },
  });

  return {
    hasCredential: !!merchant?.credential,
    savedAccount: merchant?.credential?.accountNumber
      ? {
          accountNumber: merchant.credential.accountNumber,
          bankBin: merchant.credential.bankBin ?? "",
          bankName: merchant.credential.bankName ?? "",
        }
      : null,
  };
};

export default function Settings() {
  const { hasCredential, savedAccount } = useLoaderData<typeof loader>();
  return <CredentialForm hasCredential={hasCredential} savedAccount={savedAccount} />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
