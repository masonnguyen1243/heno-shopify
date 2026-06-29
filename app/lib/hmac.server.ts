import { createHmac, timingSafeEqual } from "crypto";

export interface VerifyHMACParams {
  signature: string;
  timestamp: string;
  body: string;
  secretToken: string;
}

export function verifyHMAC(params: VerifyHMACParams): boolean {
  if (!params.secretToken) return false;
  try {
    const expected = createHmac("sha512", params.secretToken)
      .update(`${params.timestamp}:${params.body}`)
      .digest("hex");
    const expectedBuf = Buffer.from(expected, "utf8");
    const actualBuf = Buffer.from(params.signature, "utf8");
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}
