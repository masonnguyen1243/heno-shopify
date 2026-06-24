import { PactV3, MatchersV3 } from "@pact-foundation/pact";
import path from "path";

const { like, regex } = MatchersV3;
const PAYMENT_STATUS = regex("PENDING|PROCESSING|SUCCESS|FAILED|EXPIRED", "PENDING");

const provider = new PactV3({
  consumer: "order-status-extension",
  provider: "tingee-shopify-app",
  dir: path.resolve(process.cwd(), "test/contracts/pacts"),
  logLevel: "error",
});

describe("Pact: GET /api/orders/:orderId/tingee-data", () => {
  it("pins schema: success case with QR and deeplink", async () => {
    await provider
      .addInteraction({
        states: [
          {
            description:
              "order 123 with payment method Thanh toán qua Tingee QR exists",
          },
        ],
        uponReceiving: "a request for payment data",
        withRequest: {
          method: "GET",
          path: "/api/orders/gid%3A%2F%2Fshopify%2FOrder%2F123/tingee-data",
          query: { amount: "150000", orderNumber: "1001" },
        },
        willRespondWith: {
          status: 200,
          headers: { "Content-Type": like("application/json") },
          body: {
            qrImageUrl: like("data:image/png;base64,abc123"),
            deeplinkUrl: like("tingee://pay?qr=abc"),
            amount: like(150000),
            currency: "VND",
            status: PAYMENT_STATUS,
            expiresAt: like("2026-06-24T10:00:00.000Z"),
            orderId: like("gid://shopify/Order/123"),
          },
        },
      })
      .executeTest(async (mockServer) => {
        const url = `${mockServer.url}/api/orders/gid%3A%2F%2Fshopify%2FOrder%2F123/tingee-data?amount=150000&orderNumber=1001`;
        const response = await fetch(url);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(typeof body.qrImageUrl).toBe("string");
        expect(body.currency).toBe("VND");
        expect(typeof body.amount).toBe("number");
        expect(typeof body.expiresAt).toBe("string");
        expect(typeof body.orderId).toBe("string");
      });
  });

  it("pins schema: deeplinkUrl is null when deeplink generation fails", async () => {
    await provider
      .addInteraction({
        states: [
          {
            description:
              "order 456 exists but deeplink service is unavailable",
          },
        ],
        uponReceiving: "a request for payment data when deeplink is unavailable",
        withRequest: {
          method: "GET",
          path: "/api/orders/gid%3A%2F%2Fshopify%2FOrder%2F456/tingee-data",
          query: { amount: "75000", orderNumber: "1002" },
        },
        willRespondWith: {
          status: 200,
          headers: { "Content-Type": like("application/json") },
          body: {
            qrImageUrl: like("data:image/png;base64,abc123"),
            deeplinkUrl: null,
            amount: like(75000),
            currency: "VND",
            status: PAYMENT_STATUS,
            expiresAt: like("2026-06-24T10:00:00.000Z"),
            orderId: like("gid://shopify/Order/456"),
          },
        },
      })
      .executeTest(async (mockServer) => {
        const url = `${mockServer.url}/api/orders/gid%3A%2F%2Fshopify%2FOrder%2F456/tingee-data?amount=75000&orderNumber=1002`;
        const response = await fetch(url);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.deeplinkUrl).toBeNull();
        expect(body.currency).toBe("VND");
      });
  });
});
