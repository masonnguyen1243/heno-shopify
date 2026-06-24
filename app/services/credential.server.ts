import db from "../db.server";
import { encrypt, decrypt } from "../lib/encryption.server";
import { sanitizeForLog } from "../lib/logger.server";
import { env } from "../lib/env.server";

export async function saveCredential(
  shop: string,
  clientId: string,
  secretToken: string,
  account?: { accountNumber: string; bankBin: string; bankName: string }
): Promise<void> {
  const merchant = await db.merchant.findUnique({
    where: { shopDomain: shop },
    select: { id: true },
  });
  if (!merchant) throw new Error(`Merchant not found: ${shop}`);

  const encryptedClientId = encrypt(clientId, env.ENCRYPTION_KEY);
  const encryptedSecretToken = encrypt(secretToken, env.ENCRYPTION_KEY);

  const data = {
    encryptedClientId,
    encryptedSecretToken,
    keyVersion: 1,
    ...(account && {
      accountNumber: account.accountNumber,
      bankBin: account.bankBin,
      bankName: account.bankName,
    }),
  };

  await db.merchantCredential.upsert({
    where: { merchantId: merchant.id },
    create: { merchantId: merchant.id, ...data },
    update: data,
  });

  console.info("Credential saved", { shop });
}

export async function deleteCredential(shop: string): Promise<void> {
  await db.merchantCredential.deleteMany({
    where: { merchant: { shopDomain: shop } },
  });
  console.info("Credential deleted", { shop });
}

export async function getDecryptedCredential(
  shop: string
): Promise<{ clientId: string; secretToken: string } | null> {
  const merchant = await db.merchant.findUnique({
    where: { shopDomain: shop },
    include: { credential: true },
  });
  if (!merchant?.credential) return null;
  try {
    const clientId = decrypt(merchant.credential.encryptedClientId, env.ENCRYPTION_KEY);
    const secretToken = decrypt(merchant.credential.encryptedSecretToken, env.ENCRYPTION_KEY);
    return { clientId, secretToken };
  } catch {
    return null;
  }
}

export async function hasCredential(shop: string): Promise<boolean> {
  const merchant = await db.merchant.findUnique({
    where: { shopDomain: shop },
    include: { credential: { select: { id: true } } },
  });
  return !!merchant?.credential;
}
