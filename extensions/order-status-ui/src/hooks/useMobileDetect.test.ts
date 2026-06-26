// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMobileDetect } from "./useMobileDetect";

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function mockInnerWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, value: width });
}

function mockUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", { writable: true, value: ua, configurable: true });
}

beforeEach(() => {
  // Reset to desktop defaults
  mockMatchMedia(false);
  mockInnerWidth(1280);
  mockUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMobileDetect", () => {
  it("returns true when all 3 signals are true", () => {
    mockMatchMedia(true);
    mockInnerWidth(375);
    mockUserAgent("Mozilla/5.0 (Linux; Android 11; Pixel 5) Mobile Safari/537.36");
    const { result } = renderHook(() => useMobileDetect());
    expect(result.current).toBe(true);
  });

  it("returns true with 2/3 signals (coarse pointer + narrow width, no Mobi UA)", () => {
    mockMatchMedia(true);
    mockInnerWidth(375);
    mockUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");
    const { result } = renderHook(() => useMobileDetect());
    expect(result.current).toBe(true);
  });

  it("returns true with 2/3 signals (narrow width + Mobi UA, no coarse pointer)", () => {
    mockMatchMedia(false);
    mockInnerWidth(375);
    mockUserAgent("Mozilla/5.0 (Linux; Android 11) Mobile Safari/537.36");
    const { result } = renderHook(() => useMobileDetect());
    expect(result.current).toBe(true);
  });

  it("returns false with only 1/3 signals (only narrow screen)", () => {
    mockMatchMedia(false);
    mockInnerWidth(375);
    mockUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");
    const { result } = renderHook(() => useMobileDetect());
    expect(result.current).toBe(false);
  });

  it("iPad Pro portrait: coarse touch + narrow width → true (2/3, no Mobi in UA)", () => {
    mockMatchMedia(true);
    mockInnerWidth(767);
    mockUserAgent("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15");
    const { result } = renderHook(() => useMobileDetect());
    expect(result.current).toBe(true);
  });

  it("Samsung DeX: large screen + no touch + no Mobi UA → false (0/3)", () => {
    mockMatchMedia(false);
    mockInnerWidth(1920);
    mockUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/96");
    const { result } = renderHook(() => useMobileDetect());
    expect(result.current).toBe(false);
  });

  it("returns false on desktop (all 0 signals)", () => {
    mockMatchMedia(false);
    mockInnerWidth(1440);
    mockUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120");
    const { result } = renderHook(() => useMobileDetect());
    expect(result.current).toBe(false);
  });

  it("Cốc Cốc browser on mobile: has Mobi + narrow → true (2/3)", () => {
    mockMatchMedia(false);
    mockInnerWidth(390);
    mockUserAgent("Mozilla/5.0 (Linux; Android 12) coc_coc_browser/105 Mobile");
    const { result } = renderHook(() => useMobileDetect());
    expect(result.current).toBe(true);
  });
});
