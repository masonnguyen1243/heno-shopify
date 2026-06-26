import type { PaymentStatus } from "../utils/constants";

export type PaymentStatusResponse = {
  status: PaymentStatus;
  paidAt?: string;
};

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

export async function fetchPaymentStatus(
  orderId: string,
  signal?: AbortSignal
): Promise<PaymentStatusResponse> {
  const url = `/api/orders/${encodeURIComponent(orderId)}/payment-status`;
  const response = await fetch(url, { signal });

  if (!response.ok) {
    const err = (await response
      .json()
      .catch(() => ({ error: `HTTP ${response.status}`, code: "REQUEST_FAILED" }))) as {
      error?: string;
      code?: string;
    };
    throw Object.assign(
      new Error(err.error ?? `HTTP ${response.status}`),
      { code: err.code ?? "REQUEST_FAILED", status: response.status }
    );
  }

  return response.json() as Promise<PaymentStatusResponse>;
}
