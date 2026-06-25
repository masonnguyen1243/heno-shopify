import type { PaymentStatus } from "../utils/constants";

export type TingeeDataResponse = {
  qrImageUrl: string;
  deeplinkUrl: string | null;
  amount: number;
  currency: "VND";
  status: PaymentStatus;
  expiresAt: string;
  orderId: string;
};

export type TingeeDataError = {
  error: string;
  code: string;
};

export async function fetchTingeeData(
  orderId: string,
  amount: number,
  orderNumber: string
): Promise<TingeeDataResponse> {
  const url = `/api/orders/${encodeURIComponent(orderId)}/tingee-data?amount=${amount}&orderNumber=${encodeURIComponent(orderNumber)}`;
  const response = await fetch(url);

  if (!response.ok) {
    let err: TingeeDataError = { error: `HTTP ${response.status}`, code: "REQUEST_FAILED" };
    try {
      err = await response.json();
    } catch {
      // non-JSON error body (e.g. HTML 502/504)
    }
    throw Object.assign(new Error(err.error), { code: err.code, status: response.status });
  }

  return response.json() as Promise<TingeeDataResponse>;
}
