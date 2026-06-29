import { Badge } from "@shopify/ui-extensions-react/checkout";
import type { PaymentStatus } from "../utils/constants";
import { t } from "../utils/i18n";

type Props = { status: PaymentStatus; locale: string };

const STATUS_TONE: Record<PaymentStatus, "success" | "warning" | "critical" | "attention"> = {
  COMPLETED: "success",
  PENDING: "warning",
  EXPIRED: "critical",
  FAILED: "critical",
};

const STATUS_KEY: Record<PaymentStatus, "paid" | "pending" | "expired"> = {
  COMPLETED: "paid",
  PENDING: "pending",
  EXPIRED: "expired",
  FAILED: "expired",
};

export function StatusBadge({ status, locale }: Props) {
  return <Badge tone={STATUS_TONE[status]}>{t(STATUS_KEY[status], locale)}</Badge>;
}
