import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

interface EncryptedPayload {
  version: number;
  iv: string;
  tag: string;
  data: string;
}

export function encrypt(plaintext: string, hexKey: string): string {
  const key = Buffer.from(hexKey, "hex");
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedPayload = {
    version: 1,
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex"),
  };
  return JSON.stringify(payload);
}

export function decrypt(cipherJson: string, hexKey: string): string {
  const { iv, tag, data }: EncryptedPayload = JSON.parse(cipherJson);
  const key = Buffer.from(hexKey, "hex");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return (
    decipher.update(Buffer.from(data, "hex")).toString("utf8") +
    decipher.final("utf8")
  );
}
