import db from "../db.server";
import { encrypt } from "../lib/encryption.server";
import { sanitizeForLog } from "../lib/logger.server";
import { env } from "../lib/env.server";

export async function saveCredential(
  shop: string,
  clientId: string,
  secretToken: string
): Promise<void> {
  const merchant = await db.merchant.findUnique({
    where: { shopDomain: shop },
    select: { id: true },
  });
  if (!merchant) throw new Error(`Merchant not found: ${shop}`);

  const encryptedClientId = encrypt(clientId, env.ENCRYPTION_KEY);
  const encryptedSecretToken = encrypt(secretToken, env.ENCRYPTION_KEY);

  await db.merchantCredential.upsert({
    where: { merchantId: merchant.id },
    create: {
      merchantId: merchant.id,
      encryptedClientId,
      encryptedSecretToken,
      keyVersion: 1,
    },
    update: {
      encryptedClientId,
      encryptedSecretToken,
      keyVersion: 1,
    },
  });

  console.info("Credential saved", { shop });
}

export async function hasCredential(shop: string): Promise<boolean> {
  const merchant = await db.merchant.findUnique({
    where: { shopDomain: shop },
    include: { credential: { select: { id: true } } },
  });
  return !!merchant?.credential;
}
