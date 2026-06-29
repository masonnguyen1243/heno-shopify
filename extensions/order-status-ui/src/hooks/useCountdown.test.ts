// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCountdown } from "./useCountdown";

const NOW = new Date("2026-01-01T00:00:00.000Z").getTime();
const FUTURE_900S = new Date(NOW + 900 * 1000).toISOString();
const PAST = new Date(NOW - 1000).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useCountdown", () => {
  it("returns secondsLeft=900 and isExpired=false for expiresAt 900s in future", () => {
    const { result } = renderHook(() => useCountdown(FUTURE_900S));
    expect(result.current.secondsLeft).toBe(900);
    expect(result.current.isExpired).toBe(false);
  });

  it("decrements secondsLeft by 1 after 1000ms", () => {
    const { result } = renderHook(() => useCountdown(FUTURE_900S));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.secondsLeft).toBe(899);
  });

  it("reaches secondsLeft=0 and isExpired=true after timer runs out", () => {
    const { result } = renderHook(() => useCountdown(FUTURE_900S));
    act(() => {
      vi.advanceTimersByTime(900 * 1000);
    });
    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.isExpired).toBe(true);
  });

  it("calls onExpire exactly once when countdown reaches 0", () => {
    const onExpire = vi.fn();
    renderHook(() => useCountdown(FUTURE_900S, onExpire));
    act(() => {
      vi.advanceTimersByTime(901 * 1000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("calls onExpire immediately when expiresAt is already in the past", () => {
    const onExpire = vi.fn();
    renderHook(() => useCountdown(PAST, onExpire));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("returns isExpired=true immediately when expiresAt is in the past", () => {
    const { result } = renderHook(() => useCountdown(PAST));
    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.isExpired).toBe(true);
  });

  it("returns secondsLeft=0 and isExpired=false when expiresAt is null", () => {
    const { result } = renderHook(() => useCountdown(null));
    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.isExpired).toBe(false);
  });

  it("does NOT start timer when expiresAt is null", () => {
    renderHook(() => useCountdown(null));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears timer on unmount — no memory leak", () => {
    const { unmount } = renderHook(() => useCountdown(FUTURE_900S));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  // P2 patch: invalid date string guard
  it("returns secondsLeft=0 and isExpired=false for invalid date string", () => {
    const { result } = renderHook(() => useCountdown("not-a-date"));
    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.isExpired).toBe(false);
  });

  it("does NOT start timer for invalid date string", () => {
    renderHook(() => useCountdown("not-a-date"));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(vi.getTimerCount()).toBe(0);
  });

  // P1 patch: onExpireCalledRef resets when expiresAt changes
  it("fires onExpire again when expiresAt changes to a new future value after first expiry", () => {
    const onExpire = vi.fn();
    const FUTURE_5S = new Date(NOW + 5 * 1000).toISOString();
    const FUTURE_10S = new Date(NOW + 10 * 1000).toISOString();

    const { rerender } = renderHook(
      ({ expiresAt }: { expiresAt: string }) => useCountdown(expiresAt, onExpire),
      { initialProps: { expiresAt: FUTURE_5S } }
    );

    act(() => { vi.advanceTimersByTime(5000); });
    expect(onExpire).toHaveBeenCalledTimes(1);

    // Change to a new expiresAt — ref should reset
    rerender({ expiresAt: FUTURE_10S });
    act(() => { vi.advanceTimersByTime(10000); });
    expect(onExpire).toHaveBeenCalledTimes(2);
  });
});
