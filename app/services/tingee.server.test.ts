import { describe, it, expect, vi, beforeEach } from "vitest";

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

import {
  generateQR,
  generateDeeplink,
  TingeeConnectionError,
} from "./tingee.server";
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
