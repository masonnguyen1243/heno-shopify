// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePaymentStatus } from "./usePaymentStatus";

vi.mock("../api/client", () => ({
  fetchPaymentStatus: vi.fn(),
  fetchTingeeData: vi.fn(),
}));

import { fetchPaymentStatus } from "../api/client";

const mockFetch = vi.mocked(fetchPaymentStatus);
const mockGetToken = vi.fn().mockResolvedValue("test-token");
const mockAppUrl = "https://test-app.example.com";

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.useFakeTimers();
  Object.defineProperty(document, "hidden", { writable: true, value: false });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePaymentStatus", () => {
  it("polls immediately (0ms) when status is PENDING", async () => {
    mockFetch.mockResolvedValue({ status: "PENDING" });

    const { result } = renderHook(() =>
      usePaymentStatus("order-1", "PENDING", mockGetToken, mockAppUrl)
    );

    expect(mockFetch).not.toHaveBeenCalled();

    // Advance just 1ms to fire the 0ms setTimeout without triggering infinite recursion
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(mockFetch).toHaveBeenCalledWith("order-1", "test-token", mockAppUrl, expect.any(AbortSignal));
  });

  it("updates status to COMPLETED and stops polling", async () => {
    mockFetch.mockResolvedValue({ status: "COMPLETED", paidAt: "2026-06-26T12:00:00Z" });

    const { result } = renderHook(() =>
      usePaymentStatus("order-1", "PENDING", mockGetToken, mockAppUrl)
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.status).toBe("COMPLETED");
    expect(result.current.paidAt).toBe("2026-06-26T12:00:00Z");

    // Advance timers further — should NOT poll again
    const callsBefore = mockFetch.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(mockFetch.mock.calls.length).toBe(callsBefore);
  });

  it("backs off to 10s after 3 consecutive failures", async () => {
    mockFetch.mockRejectedValue(
      Object.assign(new Error("network error"), { status: undefined })
    );

    renderHook(() => usePaymentStatus("order-1", "PENDING"));

    // First poll at 0ms
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    // 2nd poll at 5s
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    // 3rd poll at 5s
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    // After 3 failures, 4th poll should be scheduled at 10s not 5s
    const callCount3 = mockFetch.mock.calls.length;
    expect(callCount3).toBeGreaterThanOrEqual(3);

    // Advance only 5s — should NOT have fired 4th poll yet (backoff is 10s)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(mockFetch.mock.calls.length).toBe(callCount3);

    // Advance another 5s (total 10s) — 4th poll fires
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(mockFetch.mock.calls.length).toBeGreaterThan(callCount3);
  });

  it("shows connection toast after 6+ consecutive failures", async () => {
    mockFetch.mockRejectedValue(
      Object.assign(new Error("network error"), { status: undefined })
    );

    const { result } = renderHook(() =>
      usePaymentStatus("order-1", "PENDING", mockGetToken, mockAppUrl)
    );

    expect(result.current.showConnectionToast).toBe(false);

    // Run enough timers to accumulate 6 failures
    // Failure 1: 0ms, 2: 5s, 3: 5s, 4-6: at backoff intervals 10s, 20s, 30s
    await act(async () => { await vi.advanceTimersByTimeAsync(1); }); // f1
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); // f2
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); // f3
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); }); // f4 (backoff step 1)
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); }); // f5 (backoff step 2)
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); }); // f6 (backoff step 3, capped)

    expect(result.current.showConnectionToast).toBe(true);
  });

  it("stops polling immediately on HTTP 4xx", async () => {
    mockFetch.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 })
    );

    renderHook(() => usePaymentStatus("order-1", "PENDING"));

    await act(async () => { await vi.runAllTimersAsync(); });

    const callsAfterFirst = mockFetch.mock.calls.length;
    expect(callsAfterFirst).toBe(1);

    // Advance further — no more polls
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(mockFetch.mock.calls.length).toBe(1);
  });

  it("stops polling after unmount — no calls after cleanup", async () => {
    mockFetch.mockResolvedValue({ status: "PENDING" });

    const { unmount } = renderHook(() =>
      usePaymentStatus("order-1", "PENDING", mockGetToken, mockAppUrl)
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const callsBefore = mockFetch.mock.calls.length;

    unmount();

    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(mockFetch.mock.calls.length).toBe(callsBefore);
  });

  it("pauses polling when tab is hidden, resumes when visible", async () => {
    mockFetch.mockResolvedValue({ status: "PENDING" });

    renderHook(() => usePaymentStatus("order-1", "PENDING"));

    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const callsBeforeHide = mockFetch.mock.calls.length;

    // Tab becomes hidden
    await act(async () => {
      Object.defineProperty(document, "hidden", { writable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Advance timers — should not poll while hidden
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(mockFetch.mock.calls.length).toBe(callsBeforeHide);

    // Tab becomes visible again
    await act(async () => {
      Object.defineProperty(document, "hidden", { writable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBeforeHide);
  });

  it("rehydrates from sessionStorage cache if < 30s old", () => {
    const cached = { status: "COMPLETED" as const, paidAt: "2026-06-26T10:00:00Z", cachedAt: Date.now() };
    sessionStorage.setItem("tng_payment_order-cache", JSON.stringify(cached));

    const { result } = renderHook(() =>
      usePaymentStatus("order-cache", "PENDING", mockGetToken, mockAppUrl)
    );

    // Should immediately have COMPLETED from cache without waiting for fetch
    expect(result.current.status).toBe("COMPLETED");
    expect(result.current.paidAt).toBe("2026-06-26T10:00:00Z");
  });

  it("ignores sessionStorage cache older than 30s", async () => {
    const stale = { status: "COMPLETED" as const, cachedAt: Date.now() - 31_000 };
    sessionStorage.setItem("tng_payment_order-stale", JSON.stringify(stale));

    mockFetch.mockResolvedValue({ status: "PENDING" });

    const { result } = renderHook(() =>
      usePaymentStatus("order-stale", "PENDING", mockGetToken, mockAppUrl)
    );

    // Stale cache should not rehydrate as COMPLETED — poll will return PENDING
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });

    expect(result.current.status).not.toBe("COMPLETED");
    expect(result.current.status).toBe("PENDING");
  });

  it("does not start polling if initialStatus is already a terminal state", async () => {
    const { result } = renderHook(() =>
      usePaymentStatus("order-done", "COMPLETED", mockGetToken, mockAppUrl)
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.status).toBe("COMPLETED");
  });

  it("does not poll when orderId is null", async () => {
    renderHook(() => usePaymentStatus(null, null, mockGetToken, mockAppUrl));

    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
