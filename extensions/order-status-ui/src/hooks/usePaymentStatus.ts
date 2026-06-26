import { useState, useEffect, useRef, useCallback } from "react";
import type { PaymentStatus } from "../utils/constants";
import { POLL_INTERVAL_MS } from "../utils/constants";
import { fetchPaymentStatus } from "../api/client";

const BACKOFF_STEPS = [10000, 20000, 30000];
const TOAST_FAILURE_THRESHOLD = 6;
const SESSION_CACHE_TTL_MS = 30_000;
const TERMINAL_STATES = new Set<PaymentStatus>(["COMPLETED", "EXPIRED", "FAILED"]);

type CachedStatus = { status: PaymentStatus; paidAt?: string; cachedAt: number };

function readCache(orderId: string): CachedStatus | null {
  try {
    const raw = sessionStorage.getItem(`tng_payment_${orderId}`);
    if (!raw) return null;
    const parsed: CachedStatus = JSON.parse(raw);
    if (TERMINAL_STATES.has(parsed.status)) return parsed;
    return Date.now() - parsed.cachedAt < SESSION_CACHE_TTL_MS ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(orderId: string, status: PaymentStatus, paidAt?: string): void {
  try {
    sessionStorage.setItem(
      `tng_payment_${orderId}`,
      JSON.stringify({ status, paidAt, cachedAt: Date.now() })
    );
  } catch {}
}

export type UsePaymentStatusResult = {
  status: PaymentStatus | null;
  paidAt?: string;
  showConnectionToast: boolean;
};

export function usePaymentStatus(
  orderId: string | null,
  initialStatus: PaymentStatus | null
): UsePaymentStatusResult {
  const [status, setStatus] = useState<PaymentStatus | null>(() => {
    if (!orderId) return null;
    return readCache(orderId)?.status ?? null;
  });
  const [paidAt, setPaidAt] = useState<string | undefined>(() =>
    orderId ? readCache(orderId)?.paidAt : undefined
  );
  const [showConnectionToast, setShowConnectionToast] = useState(false);

  const currentStatusRef = useRef<PaymentStatus | null>(status);
  const consecutiveFailuresRef = useRef(0);
  const currentIntervalRef = useRef(POLL_INTERVAL_MS);
  const isActiveRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (initialStatus !== null && currentStatusRef.current === null) {
      setStatus(initialStatus);
      currentStatusRef.current = initialStatus;
    }
  }, [initialStatus]);

  useEffect(() => {
    currentStatusRef.current = status;
  }, [status]);

  const poll = useCallback(async () => {
    if (!isActiveRef.current || !orderId || pausedRef.current) return;
    if (currentStatusRef.current && TERMINAL_STATES.has(currentStatusRef.current)) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await fetchPaymentStatus(orderId, controller.signal);
      if (!isActiveRef.current || controller.signal.aborted) return;

      consecutiveFailuresRef.current = 0;
      currentIntervalRef.current = POLL_INTERVAL_MS;
      setShowConnectionToast(false);

      const newStatus = result.status;
      setStatus(newStatus);
      currentStatusRef.current = newStatus;
      if (result.paidAt) setPaidAt(result.paidAt);
      writeCache(orderId, newStatus, result.paidAt);

      if (!TERMINAL_STATES.has(newStatus) && isActiveRef.current) {
        timerRef.current = setTimeout(poll, currentIntervalRef.current);
      }
    } catch (err: unknown) {
      if (!isActiveRef.current || (err instanceof DOMException && err.name === "AbortError")) return;

      const httpStatus = (err as { status?: number })?.status;
      if (httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500 && httpStatus !== 429) {
        try { if (orderId) sessionStorage.removeItem(`tng_payment_${orderId}`); } catch {}
        return;
      }

      consecutiveFailuresRef.current++;
      const failures = consecutiveFailuresRef.current;
      if (failures >= TOAST_FAILURE_THRESHOLD) setShowConnectionToast(true);
      if (failures >= 3) {
        const backoffIdx = Math.min(failures - 3, BACKOFF_STEPS.length - 1);
        currentIntervalRef.current = BACKOFF_STEPS[backoffIdx];
      }
      if (isActiveRef.current) {
        timerRef.current = setTimeout(poll, currentIntervalRef.current);
      }
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;
    isActiveRef.current = true;

    const currentStatus = currentStatusRef.current;
    if (currentStatus && TERMINAL_STATES.has(currentStatus)) return;

    timerRef.current = setTimeout(poll, 0);

    return () => {
      isActiveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      abortControllerRef.current?.abort();
    };
  }, [orderId, poll]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        pausedRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        abortControllerRef.current?.abort();
      } else {
        pausedRef.current = false;
        if (
          isActiveRef.current &&
          currentStatusRef.current &&
          !TERMINAL_STATES.has(currentStatusRef.current)
        ) {
          timerRef.current = setTimeout(poll, 0);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [poll]);

  return { status, paidAt, showConnectionToast };
}
