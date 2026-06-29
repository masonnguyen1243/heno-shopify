import { Text } from "@shopify/ui-extensions-react/checkout";
import { useCountdown } from "../hooks/useCountdown";

type Props = { expiresAt: string | null; onExpire: () => void; locale: string };

export function CountdownTimer({ expiresAt, onExpire, locale }: Props) {
  const { secondsLeft, isExpired } = useCountdown(expiresAt, onExpire);
  if (isExpired) return null;

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");

  const label = locale.startsWith("vi")
    ? `Còn lại: ${mins} phút ${secs} giây`
    : `Expires in: ${mins}m ${secs}s`;

  return <Text appearance="subdued">{label} — {mm}:{ss}</Text>;
}
