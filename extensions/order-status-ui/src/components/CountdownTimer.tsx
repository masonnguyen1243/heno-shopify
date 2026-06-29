import { useCountdown } from "../hooks/useCountdown";

type Props = {
  expiresAt: string | null;
  onExpire: () => void;
  locale: string;
};

export function CountdownTimer({ expiresAt, onExpire, locale }: Props) {
  const { secondsLeft, isExpired } = useCountdown(expiresAt, onExpire);

  if (isExpired) return null; // PaymentCard handles expired UI

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");

  const ariaLabel = locale.startsWith("vi")
    ? `Thời gian còn lại: ${mins} phút ${secs} giây`
    : `Time remaining: ${mins} minutes ${secs} seconds`;

  return (
    <p className="tng-countdown-timer" aria-live="off" aria-label={ariaLabel}>
      {mm}:{ss}
    </p>
  );
}
