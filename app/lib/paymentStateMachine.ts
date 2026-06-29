import type { PaymentStatus } from "@prisma/client";

export type { PaymentStatus };

const VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING:    ["PROCESSING", "FAILED", "EXPIRED"],
  PROCESSING: ["SUCCESS", "FAILED"],
  SUCCESS:    [],
  FAILED:     [],
  EXPIRED:    [],
};

export function assertValidTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!VALID_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid payment transition: ${from} → ${to}`);
  }
}
