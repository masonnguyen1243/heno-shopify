import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockMerchantGetPaging,
  mockBankGetVaPaging,
  mockIsSuccessResponse,
} = vi.hoisted(() => ({
  mockMerchantGetPaging: vi.fn(),
  mockBankGetVaPaging: vi.fn(),
  mockIsSuccessResponse: vi.fn(),
}));

vi.mock("../db.server", () => ({
  default: {
    payment: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../lib/idempotency.server", () => ({
  insertIdempotencyRecord: vi.fn(),
  updateIdempotencyStatus: vi.fn(),
}));

vi.mock("../lib/paymentStateMachine", () => ({
  assertValidTransition: vi.fn(),
}));

vi.mock("./order.server", () => ({
  addOrderNote: vi.fn(),
}));

vi.mock("./credential.server", () => ({
  getDecryptedCredential: vi.fn(),
}));

vi.mock("./tingee.server", () => ({
  generateQR: vi.fn(),
  generateDeeplink: vi.fn(),
  TingeeConnectionError: class TingeeConnectionError extends Error {
    constructor(msg?: string) {
      super(msg ?? "Cannot connect to Tingee");
      this.name = "TingeeConnectionError";
    }
  },
}));

vi.mock("../lib/logger.server", () => ({
  sanitizeForLog: vi.fn((obj) => obj),
}));

vi.mock("@tingee/sdk-node", () => ({
  TingeeClient: vi.fn(function () {
    return {
      merchant: { getPaging: mockMerchantGetPaging },
      bank: { getVaPaging: mockBankGetVaPaging },
    };
  }),
  isSuccessResponse: mockIsSuccessResponse,
  TingeeHttpError: class TingeeHttpError extends Error {},
}));

vi.mock("../lib/env.server", () => ({
  env: { TINGEE_SDK_TIMEOUT_MS: 4000 },
}));

import { createPaymentData, reconcileWebhookPayment, type TingeeWebhookPayload } from "./payment.server";
import { getDecryptedCredential } from "./credential.server";
import { generateQR, generateDeeplink, TingeeConnectionError } from "./tingee.server";
import db from "../db.server";
import { insertIdempotencyRecord, updateIdempotencyStatus } from "../lib/idempotency.server";
import { assertValidTransition } from "../lib/paymentStateMachine";
import { addOrderNote } from "./order.server";

const mockParams = {
  shopDomain: "test.myshopify.com",
  orderId: "gid://shopify/Order/123",
  orderNumber: "1001",
  amount: 150000,
};

const mockCredential = {
  clientId: "cid",
  secretToken: "st",
  accountNumber: "12345678",
  vaAccountNumber: "VA12345678",
  bankBin: "970436",
  bankName: "Vietcombank",
};

const mockQrResult = {
  qrCode: "QR_TEXT",
  qrImageUrl: "data:image/png;base64,ABC",
};

const mockMerchantResponse = {
  data: { items: [{ id: 42 }] },
};

const mockVaResponse = {
  data: {
    items: [
      {
        accountNumber: "12345678",
        bankBin: "970448",
        accountName: "Test Merchant",
        status: "active",
      },
    ],
  },
};

function setupMerchantInfoMocks() {
  mockIsSuccessResponse.mockReturnValue(true);
  mockMerchantGetPaging.mockResolvedValue(mockMerchantResponse);
  mockBankGetVaPaging.mockResolvedValue(mockVaResponse);
}

describe("createPaymentData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing non-expired Payment without calling Tingee", async () => {
    const existingPayment = {
      orderId: mockParams.orderId,
      orderNumber: mockParams.orderNumber,
      shopDomain: mockParams.shopDomain,
      status: "PENDING",
      qrImageUrl: "data:image/png;base64,EXISTING",
      deeplinkUrl: "tingee://pay?existing",
      amount: 150000,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };
    vi.mocked(db.payment.findFirst).mockResolvedValue(existingPayment as any);

    const result = await createPaymentData(mockParams);

    expect(result.qrImageUrl).toBe("data:image/png;base64,EXISTING");
    expect(result.deeplinkUrl).toBe("tingee://pay?existing");
    expect(getDecryptedCredential).not.toHaveBeenCalled();
    expect(generateQR).not.toHaveBeenCalled();
  });

  it("returns expired payment data without regenerating", async () => {
    const expiredPayment = {
      orderId: mockParams.orderId,
      orderNumber: mockParams.orderNumber,
      shopDomain: mockParams.shopDomain,
      status: "EXPIRED",
      qrImageUrl: "data:image/png;base64,EXPIRED",
      deeplinkUrl: null,
      amount: 150000,
      expiresAt: new Date(Date.now() - 60 * 1000),
    };
    vi.mocked(db.payment.findFirst).mockResolvedValue(expiredPayment as any);

    const result = await createPaymentData(mockParams);

    expect(result.status).toBe("EXPIRED");
    expect(generateQR).not.toHaveBeenCalled();
  });

  it("throws Error when credential not found", async () => {
    vi.mocked(db.payment.findFirst).mockResolvedValue(null);
    vi.mocked(getDecryptedCredential).mockResolvedValue(null);

    await expect(createPaymentData(mockParams)).rejects.toThrow(
      /no Tingee credentials configured/
    );
  });

  it("creates new payment with QR and deeplink on success", async () => {
    vi.mocked(db.payment.findFirst).mockResolvedValue(null);
    vi.mocked(getDecryptedCredential).mockResolvedValue(mockCredential);
    setupMerchantInfoMocks();
    vi.mocked(generateQR).mockResolvedValue(mockQrResult);
    vi.mocked(generateDeeplink).mockResolvedValue("tingee://pay?abc");
    vi.mocked(db.payment.create).mockResolvedValue({
      orderId: mockParams.orderId,
      orderNumber: mockParams.orderNumber,
      shopDomain: mockParams.shopDomain,
      status: "PENDING",
      qrImageUrl: mockQrResult.qrImageUrl,
      deeplinkUrl: "tingee://pay?abc",
      amount: 150000,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    } as any);

    const result = await createPaymentData(mockParams);

    expect(result.qrImageUrl).toBe(mockQrResult.qrImageUrl);
    expect(result.deeplinkUrl).toBe("tingee://pay?abc");
    expect(result.currency).toBe("VND");
    expect(result.status).toBe("PENDING");
    expect(result.orderId).toBe(mockParams.orderId);
    expect(db.payment.create).toHaveBeenCalled();
  });

  it("returns deeplinkUrl as null when deeplink generation fails", async () => {
    vi.mocked(db.payment.findFirst).mockResolvedValue(null);
    vi.mocked(getDecryptedCredential).mockResolvedValue(mockCredential);
    setupMerchantInfoMocks();
    vi.mocked(generateQR).mockResolvedValue(mockQrResult);
    vi.mocked(generateDeeplink).mockResolvedValue(null);
    vi.mocked(db.payment.create).mockResolvedValue({
      orderId: mockParams.orderId,
      orderNumber: mockParams.orderNumber,
      shopDomain: mockParams.shopDomain,
      status: "PENDING",
      qrImageUrl: mockQrResult.qrImageUrl,
      deeplinkUrl: null,
      amount: 150000,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    } as any);

    const result = await createPaymentData(mockParams);

    expect(result.deeplinkUrl).toBeNull();
    expect(result.qrImageUrl).toBe(mockQrResult.qrImageUrl);
  });

  it("uses shopDomain in DB queries (IDOR prevention)", async () => {
    vi.mocked(db.payment.findFirst).mockResolvedValue(null);
    vi.mocked(getDecryptedCredential).mockResolvedValue(null);

    await expect(createPaymentData(mockParams)).rejects.toThrow();

    expect(db.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopDomain: mockParams.shopDomain,
        }),
      })
    );
  });

  it("propagates TingeeConnectionError from generateQR (causes 503)", async () => {
    vi.mocked(db.payment.findFirst).mockResolvedValue(null);
    vi.mocked(getDecryptedCredential).mockResolvedValue(mockCredential);
    setupMerchantInfoMocks();
    vi.mocked(generateQR).mockRejectedValue(new TingeeConnectionError("Timeout"));

    await expect(createPaymentData(mockParams)).rejects.toBeInstanceOf(
      TingeeConnectionError
    );
  });

  it("expiresAt is 15 minutes from now", async () => {
    vi.mocked(db.payment.findFirst).mockResolvedValue(null);
    vi.mocked(getDecryptedCredential).mockResolvedValue(mockCredential);
    setupMerchantInfoMocks();
    vi.mocked(generateQR).mockResolvedValue(mockQrResult);
    vi.mocked(generateDeeplink).mockResolvedValue(null);

    const before = Date.now();
    let capturedExpiresAt: Date | undefined;

    vi.mocked(db.payment.create).mockImplementation(async (args: any) => {
      capturedExpiresAt = args.data.expiresAt;
      return {
        ...args.data,
        orderId: mockParams.orderId,
        shopDomain: mockParams.shopDomain,
      };
    });

    await createPaymentData(mockParams);

    const after = Date.now();
    expect(capturedExpiresAt).toBeDefined();
    const ms = capturedExpiresAt!.getTime();
    expect(ms).toBeGreaterThanOrEqual(before + 15 * 60 * 1000 - 100);
    expect(ms).toBeLessThanOrEqual(after + 15 * 60 * 1000 + 100);
  });
});

const makeValidPayload = (overrides = {}): TingeeWebhookPayload => ({
  transactionCode: "TX_TEST_123",
  amount: 1500000,
  content: "TINGEE 1001",
  ...overrides,
});

const mockPaymentRecord = {
  id: "pay_01",
  orderId: "gid://shopify/Order/12345",
  orderNumber: "1001",
  shopDomain: "test.myshopify.com",
  status: "PENDING" as const,
  amount: 1500000,
  qrImageUrl: "data:image/png;base64,QR",
  deeplinkUrl: null,
  expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("reconcileWebhookPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { type: 'skip' } on duplicate idempotency key — no DB payment query", async () => {
    vi.mocked(insertIdempotencyRecord).mockResolvedValue("duplicate");
    const result = await reconcileWebhookPayment({ shopDomain: "test.myshopify.com", payload: makeValidPayload() });
    expect(result).toEqual({ type: "skip" });
    expect(db.payment.findFirst).not.toHaveBeenCalled();
  });

  it("returns { type: 'no_payment_found' } when content cannot be parsed", async () => {
    vi.mocked(insertIdempotencyRecord).mockResolvedValue("inserted");
    vi.mocked(updateIdempotencyStatus).mockResolvedValue();
    const result = await reconcileWebhookPayment({
      shopDomain: "test.myshopify.com",
      payload: makeValidPayload({ content: "INVALID CONTENT FORMAT EXTRA" }),
    });
    expect(result).toEqual({ type: "no_payment_found" });
    expect(updateIdempotencyStatus).toHaveBeenCalledWith("tingee:TX_TEST_123", "FAILED");
    expect(db.payment.findFirst).not.toHaveBeenCalled();
  });

  it("returns { type: 'no_payment_found' } when no Payment record found", async () => {
    vi.mocked(insertIdempotencyRecord).mockResolvedValue("inserted");
    vi.mocked(db.payment.findFirst).mockResolvedValue(null);
    vi.mocked(updateIdempotencyStatus).mockResolvedValue();
    const result = await reconcileWebhookPayment({ shopDomain: "test.myshopify.com", payload: makeValidPayload() });
    expect(result).toEqual({ type: "no_payment_found" });
    expect(updateIdempotencyStatus).toHaveBeenCalledWith("tingee:TX_TEST_123", "FAILED");
  });

  it("returns { type: 'invalid_transition' } when Payment is in terminal state", async () => {
    vi.mocked(insertIdempotencyRecord).mockResolvedValue("inserted");
    vi.mocked(db.payment.findFirst).mockResolvedValue({ ...mockPaymentRecord, status: "SUCCESS" } as any);
    vi.mocked(assertValidTransition).mockImplementation(() => { throw new Error("Invalid payment transition: SUCCESS → PROCESSING"); });
    vi.mocked(updateIdempotencyStatus).mockResolvedValue();
    const result = await reconcileWebhookPayment({ shopDomain: "test.myshopify.com", payload: makeValidPayload() });
    expect(result).toEqual({ type: "invalid_transition" });
    expect(updateIdempotencyStatus).toHaveBeenCalledWith("tingee:TX_TEST_123", "COMPLETED");
  });

  it("returns { type: 'amount_mismatch' } and calls addOrderNote with correct message", async () => {
    vi.mocked(insertIdempotencyRecord).mockResolvedValue("inserted");
    vi.mocked(db.payment.findFirst).mockResolvedValue(mockPaymentRecord as any);
    vi.mocked(assertValidTransition).mockReturnValue(undefined);
    vi.mocked(db.payment.update).mockResolvedValue({} as any);
    vi.mocked(updateIdempotencyStatus).mockResolvedValue();
    vi.mocked(addOrderNote).mockResolvedValue();
    const result = await reconcileWebhookPayment({
      shopDomain: "test.myshopify.com",
      payload: makeValidPayload({ amount: 999999 }),
    });
    expect(result).toEqual({ type: "amount_mismatch" });
    expect(db.payment.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "FAILED" } }));
    expect(updateIdempotencyStatus).toHaveBeenCalledWith("tingee:TX_TEST_123", "COMPLETED");
    expect(addOrderNote).toHaveBeenCalledWith(
      "test.myshopify.com",
      "gid://shopify/Order/12345",
      "Tingee received 999999 VND, expected 1500000 VND — manual review required"
    );
  });

  it("returns { type: 'amount_mismatch' } even when addOrderNote throws", async () => {
    vi.mocked(insertIdempotencyRecord).mockResolvedValue("inserted");
    vi.mocked(db.payment.findFirst).mockResolvedValue(mockPaymentRecord as any);
    vi.mocked(assertValidTransition).mockReturnValue(undefined);
    vi.mocked(db.payment.update).mockResolvedValue({} as any);
    vi.mocked(updateIdempotencyStatus).mockResolvedValue();
    vi.mocked(addOrderNote).mockRejectedValue(new Error("Shopify down"));
    const result = await reconcileWebhookPayment({
      shopDomain: "test.myshopify.com",
      payload: makeValidPayload({ amount: 1 }),
    });
    expect(result).toEqual({ type: "amount_mismatch" });
  });

  it("returns { type: 'amount_matched' } and updates Payment to PROCESSING on exact match", async () => {
    vi.mocked(insertIdempotencyRecord).mockResolvedValue("inserted");
    vi.mocked(db.payment.findFirst).mockResolvedValue(mockPaymentRecord as any);
    vi.mocked(assertValidTransition).mockReturnValue(undefined);
    vi.mocked(db.payment.update).mockResolvedValue({} as any);
    vi.mocked(updateIdempotencyStatus).mockResolvedValue();
    const result = await reconcileWebhookPayment({ shopDomain: "test.myshopify.com", payload: makeValidPayload() });
    expect(result).toEqual({
      type: "amount_matched",
      payment: { id: "pay_01", orderId: "gid://shopify/Order/12345", amount: 1500000 },
      idempotencyKey: "tingee:TX_TEST_123",
    });
    expect(db.payment.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "PROCESSING" } }));
    expect(updateIdempotencyStatus).toHaveBeenCalledWith("tingee:TX_TEST_123", "AWAITING_MARK_PAID");
  });
});
