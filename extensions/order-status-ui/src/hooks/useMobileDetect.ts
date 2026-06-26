import { useState, useEffect } from "react";

function detectMobile(): boolean {
  if (typeof window === "undefined") return false;
  const signal1 =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(hover: none) and (pointer: coarse)").matches
      : false;
  const signal2 = window.innerWidth < 768;
  const signal3 =
    (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile ||
    /Mobi|Android/i.test(navigator.userAgent);
  return [signal1, signal2, signal3].filter(Boolean).length >= 2;
}

export function useMobileDetect(): boolean {
  const [isMobile, setIsMobile] = useState(() => detectMobile());

  useEffect(() => {
    setIsMobile(detectMobile());
  }, []);

  return isMobile;
}
