// NOTE: Epic 3 MUST run pact verify against this contract before merging
// any change to GET /api/orders/:orderId/payment-status response shape.
import { PactV3, MatchersV3 } from "@pact-foundation/pact";
import path from "path";

const { like, regex } = MatchersV3;

const PAYMENT_STATUS = regex(
  /(PENDING|COMPLETED|FAILED|EXPIRED)/,
  "PENDING"
);

const provider = new PactV3({
  consumer: "order-status-extension",
  provider: "tingee-shopify-app",
  dir: path.resolve(process.cwd(), "test/contracts/pacts"),
  logLevel: "error",
});

const ORDER_PATH =
  "/api/orders/gid%3A%2F%2Fshopify%2FOrder%2F123/payment-status";

describe("Pact: GET /api/orders/:orderId/payment-status", () => {
  it("pins schema: PENDING state", async () => {
    await provider
      .addInteraction({
        states: [
          {
            description: "order 123 payment is PENDING and not expired",
          },
        ],
        uponReceiving: "a polling request for payment status",
        withRequest: {
          method: "GET",
          path: ORDER_PATH,
        },
        willRespondWith: {
          status: 200,
          headers: { "Content-Type": like("application/json") },
          body: {
            status: PAYMENT_STATUS,
          },
        },
      })
      .executeTest(async (mockServer) => {
        const url = `${mockServer.url}${ORDER_PATH}`;
        const response = await fetch(url);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.status).toBe("PENDING");
        expect(body.paidAt).toBeUndefined();
      });
  });

  it("pins schema: COMPLETED state with paidAt", async () => {
    await provider
      .addInteraction({
        states: [
          {
            description: "order 123 payment is COMPLETED",
          },
        ],
        uponReceiving: "a polling request for completed payment status",
        withRequest: {
          method: "GET",
          path: ORDER_PATH,
        },
        willRespondWith: {
          status: 200,
          headers: { "Content-Type": like("application/json") },
          body: {
            status: "COMPLETED",
            paidAt: like("2026-06-24T10:00:00.000Z"),
          },
        },
      })
      .executeTest(async (mockServer) => {
        const url = `${mockServer.url}${ORDER_PATH}`;
        const response = await fetch(url);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.status).toBe("COMPLETED");
        expect(typeof body.paidAt).toBe("string");
      });
  });

  it("pins schema: EXPIRED state — no paidAt", async () => {
    await provider
      .addInteraction({
        states: [
          {
            description: "order 123 payment is EXPIRED",
          },
        ],
        uponReceiving: "a polling request for expired payment status",
        withRequest: {
          method: "GET",
          path: ORDER_PATH,
        },
        willRespondWith: {
          status: 200,
          headers: { "Content-Type": like("application/json") },
          body: {
            status: "EXPIRED",
          },
        },
      })
      .executeTest(async (mockServer) => {
        const url = `${mockServer.url}${ORDER_PATH}`;
        const response = await fetch(url);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.status).toBe("EXPIRED");
        expect(body.paidAt).toBeUndefined();
      });
  });

  it("pins schema: FAILED state — no paidAt", async () => {
    await provider
      .addInteraction({
        states: [
          {
            description: "order 123 payment has FAILED",
          },
        ],
        uponReceiving: "a polling request for failed payment status",
        withRequest: {
          method: "GET",
          path: ORDER_PATH,
        },
        willRespondWith: {
          status: 200,
          headers: { "Content-Type": like("application/json") },
          body: {
            status: "FAILED",
          },
        },
      })
      .executeTest(async (mockServer) => {
        const url = `${mockServer.url}${ORDER_PATH}`;
        const response = await fetch(url);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.status).toBe("FAILED");
        expect(body.paidAt).toBeUndefined();
      });
  });
});
