export const POLL_INTERVAL_MS = 5000;
export const EXPIRED_TIMEOUT_MS = 15 * 60 * 1000;
export const POLL_MAX_INTERVAL_MS = 30000;
export const DEEPLINK_TIMEOUT_IOS_MS = 3500;
export const DEEPLINK_TIMEOUT_ANDROID_MS = 2000;

export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "EXPIRED";
