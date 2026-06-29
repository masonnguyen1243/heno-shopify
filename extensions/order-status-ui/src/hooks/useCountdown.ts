import { useState, useEffect, useRef } from "react";

export type CountdownResult = {
  secondsLeft: number;
  isExpired: boolean;
};

function computeSecondsLeft(expiresAt: string | null): number {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime();
  if (isNaN(ms)) return 0;
  return Math.max(0, Math.ceil((ms - Date.now()) / 1000));
}

export function useCountdown(
  expiresAt: string | null,
  onExpire?: () => void
): CountdownResult {
  const [secondsLeft, setSecondsLeft] = useState(() => computeSecondsLeft(expiresAt));
  const onExpireCalledRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire; // always-fresh ref — không thêm vào deps

  useEffect(() => {
    if (!expiresAt) return;
    if (isNaN(new Date(expiresAt).getTime())) return; // invalid date — skip

    onExpireCalledRef.current = false; // reset khi expiresAt thay đổi

    // Nếu đã hết hạn khi mount → fire onExpire ngay
    const initial = computeSecondsLeft(expiresAt);
    if (initial === 0 && !onExpireCalledRef.current) {
      onExpireCalledRef.current = true;
      onExpireRef.current?.();
      return;
    }

    const interval = setInterval(() => {
      const left = computeSecondsLeft(expiresAt);
      setSecondsLeft(left);
      if (left === 0 && !onExpireCalledRef.current) {
        onExpireCalledRef.current = true;
        onExpireRef.current?.();
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const isValidExpiresAt = expiresAt !== null && !isNaN(new Date(expiresAt).getTime());
  return { secondsLeft, isExpired: secondsLeft === 0 && isValidExpiresAt };
}
