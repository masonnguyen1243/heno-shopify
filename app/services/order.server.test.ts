import { describe, it, expect, vi, beforeEach } from "vitest";
import { unregisterPaymentMethod } from "./order.server";

const SHOP = "test-store.myshopify.com";
const ACCESS_TOKEN = "shpat_test123";
const GATEWAY_ID = 42;
const GATEWAY_NAME = "Thanh toán qua Tingee QR";

function makeListResponse(gateways: Array<{ id: number; name: string }>) {
  return new Response(JSON.stringify({ payment_gateways: gateways }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("unregisterPaymentMethod", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls DELETE when gateway is found by name", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeListResponse([{ id: GATEWAY_ID, name: GATEWAY_NAME }]))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await unregisterPaymentMethod(SHOP, ACCESS_TOKEN);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const deleteCall = fetchMock.mock.calls[1];
    expect(deleteCall[0]).toContain(`/payment_gateways/${GATEWAY_ID}.json`);
    expect((deleteCall[1] as RequestInit).method).toBe("DELETE");
    expect((deleteCall[1] as RequestInit).headers).toMatchObject({
      "X-Shopify-Access-Token": ACCESS_TOKEN,
    });
  });

  it("resolves without calling DELETE when gateway not found (idempotent)", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeListResponse([]));

    await expect(unregisterPaymentMethod(SHOP, ACCESS_TOKEN)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when DELETE returns non-2xx", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeListResponse([{ id: GATEWAY_ID, name: GATEWAY_NAME }]))
      .mockResolvedValueOnce(new Response(null, { status: 422 }));

    await expect(unregisterPaymentMethod(SHOP, ACCESS_TOKEN)).rejects.toThrow(
      /Failed to unregister payment method/
    );
  });

  it("throws when GET gateways returns non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 500 })
    );

    await expect(unregisterPaymentMethod(SHOP, ACCESS_TOKEN)).rejects.toThrow(
      /Failed to list payment gateways/
    );
  });
});
