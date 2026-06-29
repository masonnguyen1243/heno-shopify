import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGenerateVietQr, mockGenerateDeeplink, mockIsSuccessResponse } =
  vi.hoisted(() => ({
    mockGenerateVietQr: vi.fn(),
    mockGenerateDeeplink: vi.fn(),
    mockIsSuccessResponse: vi.fn(),
  }));

vi.mock("@tingee/sdk-node", () => ({
  // Must use regular function (not arrow) when mocked class is called with `new`
  TingeeClient: vi.fn(function () {
    return {
      bank: { generateVietQr: mockGenerateVietQr },
      deepLink: { generate: mockGenerateDeeplink },
    };
  }),
  isSuccessResponse: mockIsSuccessResponse,
  TingeeHttpError: class TingeeHttpError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "TingeeHttpError";
      this.status = status;
    }
  },
}));

vi.mock("../lib/env.server", () => ({
  env: { TINGEE_SDK_TIMEOUT_MS: 4000 },
}));

vi.mock("../lib/hmac.server", () => ({ verifyHMAC: vi.fn() }));

import {
  generateQR,
  generateDeeplink,
  TingeeConnectionError,
  verifyWebhookHMAC,
} from "./tingee.server";
import { verifyHMAC } from "../lib/hmac.server";
import { TingeeClient } from "@tingee/sdk-node";

describe("generateQR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns qrCode and qrImageUrl as data URL on success", async () => {
    mockIsSuccessResponse.mockReturnValue(true);
    mockGenerateVietQr.mockResolvedValue({
      data: { qrCode: "QR_TEXT", qrCodeImage: "BASE64PNG" },
    });

    const result = await generateQR({
      clientId: "client1",
      secretToken: "secret1",
      amount: 150000,
      orderNumber: "1001",
      accountNumber: "12345678",
      bankBin: "970448",
    });

    expect(result).toEqual({
      qrCode: "QR_TEXT",
      qrImageUrl: "data:image/png;base64,BASE64PNG",
    });
  });

  it("creates TingeeClient with correct params", async () => {
    mockIsSuccessResponse.mockReturnValue(true);
    mockGenerateVietQr.mockResolvedValue({
      data: { qrCode: "QR", qrCodeImage: "IMG" },
    });

    await generateQR({
      clientId: "cid",
      secretToken: "st",
      amount: 100,
      orderNumber: "1",
      accountNumber: "acc",
      bankBin: "bin",
    });

    expect(TingeeClient).toHaveBeenCalledWith({
      clientId: "cid",
      secretKey: "st",
      environment: "production",
      timeout: 4000,
    });
  });

  it("calls generateVietQr with TINGEE content prefix", async () => {
    mockIsSuccessResponse.mockReturnValue(true);
    mockGenerateVietQr.mockResolvedValue({
      data: { qrCode: "QR", qrCodeImage: "IMG" },
    });

    await generateQR({
      clientId: "cid",
      secretToken: "st",
      amount: 150000,
      orderNumber: "1001",
      accountNumber: "12345678",
      bankBin: "970448",
    });

    expect(mockGenerateVietQr).toHaveBeenCalledWith({
      accountNumber: "12345678",
      bankBin: "970448",
      amount: 150000,
      content: "TINGEE 1001",
    });
  });

  it("throws TingeeConnectionError when response is not success", async () => {
    mockIsSuccessResponse.mockReturnValue(false);
    mockGenerateVietQr.mockResolvedValue({ message: "Bad credentials" });

    await expect(
      generateQR({
        clientId: "cid",
        secretToken: "st",
        amount: 100,
        orderNumber: "1",
        accountNumber: "acc",
        bankBin: "bin",
      })
    ).rejects.toBeInstanceOf(TingeeConnectionError);
  });

  it("throws TingeeConnectionError when call throws", async () => {
    mockGenerateVietQr.mockRejectedValue(new Error("Network error"));

    await expect(
      generateQR({
        clientId: "cid",
        secretToken: "st",
        amount: 100,
        orderNumber: "1",
        accountNumber: "acc",
        bankBin: "bin",
      })
    ).rejects.toBeInstanceOf(TingeeConnectionError);
  });
});

describe("generateDeeplink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns deeplink string on success", async () => {
    mockIsSuccessResponse.mockReturnValue(true);
    mockGenerateDeeplink.mockResolvedValue({ data: "tingee://pay?abc" });

    const result = await generateDeeplink({
      clientId: "cid",
      secretToken: "st",
      qrCode: "QR",
      bankBin: "970448",
      destinationBankBin: "970448",
      accountName: "Merchant Name",
      accountNumber: "12345678",
      amount: 150000,
      content: "TINGEE 1001",
      billNumber: "1001",
    });

    expect(result).toBe("tingee://pay?abc");
  });

  it("returns null when response is not success", async () => {
    mockIsSuccessResponse.mockReturnValue(false);
    mockGenerateDeeplink.mockResolvedValue({ data: null });

    const result = await generateDeeplink({
      clientId: "cid",
      secretToken: "st",
      qrCode: "QR",
      bankBin: "970448",
      destinationBankBin: "970448",
      accountName: "Name",
      accountNumber: "acc",
      amount: 100,
      content: "TINGEE 1",
      billNumber: "1",
    });

    expect(result).toBeNull();
  });

  it("returns null when call throws (non-fatal)", async () => {
    mockGenerateDeeplink.mockRejectedValue(new Error("Deeplink service down"));

    const result = await generateDeeplink({
      clientId: "cid",
      secretToken: "st",
      qrCode: "QR",
      bankBin: "970448",
      destinationBankBin: "970448",
      accountName: "Name",
      accountNumber: "acc",
      amount: 100,
      content: "TINGEE 1",
      billNumber: "1",
    });

    expect(result).toBeNull();
  });
});

describe("verifyWebhookHMAC", () => {
  // Fresh timestamp: 2026-06-29 14:30:52.123 ICT = 07:30:52 UTC
  const FRESH_TIMESTAMP = "20260629143052123";
  // Stale timestamp: 2026-06-29 14:20:00.000 ICT = 07:20:00 UTC (11 min before now)
  const STALE_TIMESTAMP = "20260629142000000";
  const SECRET = "test-secret";
  const BODY = '{"transactionCode":"TX123"}';
  const BASE_PARAMS = { secretToken: SECRET, signature: "sig", timestamp: FRESH_TIMESTAMP, body: BODY };

  // System time pinned to 2026-06-29 07:31:00.000 UTC (30s after FRESH_TIMESTAMP)
  const NOW_UTC = Date.UTC(2026, 5, 29, 7, 31, 0, 0);

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns true when signature valid and timestamp fresh", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_UTC);
    vi.mocked(verifyHMAC).mockReturnValue(true);

    expect(verifyWebhookHMAC(BASE_PARAMS)).toBe(true);
    expect(verifyHMAC).toHaveBeenCalledWith({
      signature: "sig",
      timestamp: FRESH_TIMESTAMP,
      body: BODY,
      secretToken: SECRET,
    });
  });

  it("returns false when signature invalid and timestamp fresh", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_UTC);
    vi.mocked(verifyHMAC).mockReturnValue(false);

    expect(verifyWebhookHMAC(BASE_PARAMS)).toBe(false);
  });

  it("returns false when timestamp older than 5 minutes (replay attack)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_UTC);
    vi.mocked(verifyHMAC).mockReturnValue(true);

    expect(verifyWebhookHMAC({ ...BASE_PARAMS, timestamp: STALE_TIMESTAMP })).toBe(false);
    // verifyHMAC should not be called — rejected before reaching it
    expect(verifyHMAC).not.toHaveBeenCalled();
  });

  it("returns false for malformed timestamp (not 17 chars)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_UTC);
    vi.mocked(verifyHMAC).mockReturnValue(true);

    expect(verifyWebhookHMAC({ ...BASE_PARAMS, timestamp: "20260629" })).toBe(false);
    expect(verifyHMAC).not.toHaveBeenCalled();
  });
});
