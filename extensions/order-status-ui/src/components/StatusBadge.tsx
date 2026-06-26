import type { PaymentStatus } from "../utils/constants";
import { t } from "../utils/i18n";

type Props = {
  status: PaymentStatus;
  locale: string;
};

const STATUS_CLASS: Record<PaymentStatus, string> = {
  COMPLETED: "tng-status-badge tng-status-badge--paid",
  PENDING: "tng-status-badge tng-status-badge--pending",
  EXPIRED: "tng-status-badge tng-status-badge--expired",
  FAILED: "tng-status-badge tng-status-badge--pending",
};

const STATUS_KEY: Record<PaymentStatus, "paid" | "pending" | "expired"> = {
  COMPLETED: "paid",
  PENDING: "pending",
  EXPIRED: "expired",
  FAILED: "pending",
};

export function StatusBadge({ status, locale }: Props) {
  return (
    <div aria-live="polite" className="tng-status-badge-container">
      <span className={STATUS_CLASS[status]}>{t(STATUS_KEY[status], locale)}</span>
    </div>
  );
}
