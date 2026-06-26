// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { openDeeplink } from "./deeplink";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setupUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", { writable: true, value: ua, configurable: true });
}

describe("openDeeplink", () => {
  it("sets window.location.href to the deeplink URL", () => {
    vi.useFakeTimers();
    const hrefSetter = vi.fn();
    const locationDescriptor = {
      get href() { return ""; },
      set href(v: string) { hrefSetter(v); },
    };
    Object.defineProperty(window, "location", { writable: true, value: locationDescriptor });

    setupUserAgent("Mozilla/5.0 (Linux; Android 11) Mobile Safari");
    const onFallback = vi.fn();
    openDeeplink("tingpay://pay/abc123", onFallback);

    expect(hrefSetter).toHaveBeenCalledWith("tingpay://pay/abc123");
  });

  it("calls onFallback after Android timeout (2000ms) if tab stays visible", () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "" },
    });
    Object.defineProperty(document, "hidden", { writable: true, value: false, configurable: true });
    setupUserAgent("Mozilla/5.0 (Linux; Android 11) Mobile Safari");

    const onFallback = vi.fn();
    openDeeplink("tingpay://pay/abc", onFallback);

    vi.advanceTimersByTime(1999);
    expect(onFallback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it("calls onFallback after iOS timeout (3500ms) if tab stays visible", () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "" },
    });
    Object.defineProperty(document, "hidden", { writable: true, value: false, configurable: true });
    setupUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Mobile/15E148");

    const onFallback = vi.fn();
    openDeeplink("tingpay://pay/abc", onFallback);

    vi.advanceTimersByTime(3499);
    expect(onFallback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it("cancels fallback when tab becomes hidden (app opened successfully)", () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "" },
    });
    setupUserAgent("Mozilla/5.0 (Linux; Android 11) Mobile Safari");

    const onFallback = vi.fn();
    let visibilityHandler: (() => void) | null = null;
    const addEventSpy = vi.spyOn(document, "addEventListener").mockImplementation(
      vi.fn(function (type: string, handler: EventListenerOrEventListenerObject) {
        if (type === "visibilitychange") {
          visibilityHandler = handler as () => void;
        }
      }) as typeof document.addEventListener
    );

    openDeeplink("tingpay://pay/abc", onFallback);

    // Simulate app opening (tab becomes hidden)
    Object.defineProperty(document, "hidden", { writable: true, value: true, configurable: true });
    if (visibilityHandler) visibilityHandler();

    vi.advanceTimersByTime(3000);
    expect(onFallback).not.toHaveBeenCalled();
    addEventSpy.mockRestore();
  });

  it("does NOT cancel fallback when tab stays visible on visibilitychange", () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "" },
    });
    setupUserAgent("Mozilla/5.0 (Linux; Android 11) Mobile Safari");

    const onFallback = vi.fn();
    let visibilityHandler: (() => void) | null = null;
    const addEventSpy = vi.spyOn(document, "addEventListener").mockImplementation(
      vi.fn(function (type: string, handler: EventListenerOrEventListenerObject) {
        if (type === "visibilitychange") {
          visibilityHandler = handler as () => void;
        }
      }) as typeof document.addEventListener
    );

    openDeeplink("tingpay://pay/abc", onFallback);

    // Tab visible — user didn't switch to app
    Object.defineProperty(document, "hidden", { writable: true, value: false, configurable: true });
    if (visibilityHandler) visibilityHandler();

    vi.advanceTimersByTime(2001);
    expect(onFallback).toHaveBeenCalledTimes(1);
    addEventSpy.mockRestore();
  });
});
