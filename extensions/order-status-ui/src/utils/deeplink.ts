import { DEEPLINK_TIMEOUT_IOS_MS, DEEPLINK_TIMEOUT_ANDROID_MS } from "./constants";

export function openDeeplink(url: string, onFallback: () => void): () => void {
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const timeout = isIOS ? DEEPLINK_TIMEOUT_IOS_MS : DEEPLINK_TIMEOUT_ANDROID_MS;

  window.location.href = url;

  const fallbackTimer = setTimeout(onFallback, timeout);

  // NOTE: visibilitychange fires for screen-lock/OS-overlay (false positives),
  // but QR is always visible as fallback — no user impact. Known browser API constraint.
  const cancelFallback = () => {
    if (document.hidden) {
      clearTimeout(fallbackTimer);
    }
  };
  document.addEventListener("visibilitychange", cancelFallback, { once: true });

  return () => {
    clearTimeout(fallbackTimer);
    document.removeEventListener("visibilitychange", cancelFallback);
  };
}
