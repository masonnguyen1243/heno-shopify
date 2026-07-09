// @vitest-environment jsdom
import { createElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import type { TingeeDataResponse } from "../api/client";
import {
  renderRemote,
  findByType,
  findByText,
  getText,
} from "../test-utils/remoteRender";

vi.mock("../api/client", () => ({
  fetchTingeeData: vi.fn(),
}));

vi.mock("../hooks/usePaymentStatus", () => ({
  usePaymentStatus: vi.fn(() => ({
    status: null,
    paidAt: undefined,
    showConnectionToast: false,
  })),
}));

// PaymentCard calls useSessionToken()/useSettings() from the checkout extension
// runtime API, which only exists inside a real Shopify checkout iframe — outside
// of it, calling these hooks throws "You can only call this hook when running as
// a checkout UI extension." Mock just these two, keeping every other export
// (Image, Badge, Button, BlockStack, ...) real so the rendered tree matches
// production.
vi.mock("@shopify/ui-extensions-react/checkout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shopify/ui-extensions-react/checkout")>();
  return {
    ...actual,
    useSessionToken: vi.fn(() => ({ get: vi.fn().mockResolvedValue("test-token") })),
    useSettings: vi.fn(() => ({ app_url: "https://test-app.example.com" })),
  };
});

// Mocked as a bare remote-ui host node carrying onExpire in props, so the test
// can trigger expiry directly instead of depending on the real countdown timer.
vi.mock("./CountdownTimer", () => ({
  CountdownTimer: (props: { onExpire: () => void }) =>
    createElement("mock-countdown", { onExpire: props.onExpire }),
}));

import { fetchTingeeData } from "../api/client";
import { usePaymentStatus } from "../hooks/usePaymentStatus";
import { PaymentCard } from "./PaymentCard";

const pendingData: TingeeDataResponse = {
  qrImageUrl: "https://example.com/qr.png",
  deeplinkUrl: null,
  amount: 1500000,
  currency: "VND",
  status: "PENDING",
  expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  orderId: "gid://shopify/Order/123",
};

const completedData: TingeeDataResponse = {
  ...pendingData,
  status: "COMPLETED",
};

const defaultProps = {
  orderId: "gid://shopify/Order/123",
  amount: 1500000,
  orderNumber: "#1001",
  locale: "vi",
};

// Renders PaymentCard and flushes the async sessionToken.get() -> fetchTingeeData
// chain in its mount effect.
async function renderLoaded(props: typeof defaultProps = defaultProps) {
  let root!: Awaited<ReturnType<typeof renderRemote>>;
  await act(async () => {
    root = await renderRemote(<PaymentCard {...props} />);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
  return root;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PaymentCard", () => {
  it("renders loading skeleton before data loads", async () => {
    vi.mocked(fetchTingeeData).mockReturnValue(new Promise(() => {}));
    const root = await renderRemote(<PaymentCard {...defaultProps} />);
    expect(findByType(root, "SkeletonImage")).toBeTruthy();
    expect(findByType(root, "SkeletonText")).toBeTruthy();
  });

  it("renders amount '1.500.000 đ' when data loaded", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(pendingData);
    const root = await renderLoaded();
    expect(findByText(root, "1.500.000 đ")).toBeTruthy();
  });

  it("renders success state directly when status is COMPLETED (no flash)", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(completedData);
    vi.mocked(usePaymentStatus).mockReturnValue({
      status: "COMPLETED",
      paidAt: undefined,
      showConnectionToast: false,
    });
    const root = await renderLoaded();
    expect(findByText(root, "Đã thanh toán ✓")).toBeTruthy();
    expect(findByText(root, "Chờ thanh toán")).toBeUndefined();
  });

  it("shows paidConfirmMessage when polled status is COMPLETED", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(pendingData);
    vi.mocked(usePaymentStatus).mockReturnValue({
      status: "COMPLETED",
      paidAt: undefined,
      showConnectionToast: false,
    });
    const root = await renderLoaded();
    expect(findByText(root, "Đơn hàng của bạn đã được xác nhận. Cảm ơn!")).toBeTruthy();
  });

  it("shows connection toast when showConnectionToast is true", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(pendingData);
    vi.mocked(usePaymentStatus).mockReturnValue({
      status: "PENDING",
      paidAt: undefined,
      showConnectionToast: true,
    });
    const root = await renderLoaded();
    expect(findByText(root, "Đang kiểm tra kết nối...")).toBeTruthy();
  });

  it("renders Vietnamese text when locale is 'vi'", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(pendingData);
    const root = await renderLoaded({ ...defaultProps, locale: "vi" });
    expect(findByText(root, "Thanh toán qua Tingee QR")).toBeTruthy();
    expect(findByText(root, "Chờ thanh toán")).toBeTruthy();
  });

  it("renders English text when locale is 'en'", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(pendingData);
    const root = await renderLoaded({ ...defaultProps, locale: "en" });
    expect(findByText(root, "Pay with Tingee QR")).toBeTruthy();
  });

  it("renders a friendly error Banner (no raw error codes) when fetchTingeeData returns HTTP 503", async () => {
    vi.mocked(fetchTingeeData).mockRejectedValue(
      Object.assign(new Error("Service unavailable"), { code: "TINGEE_UNAVAILABLE", status: 503 })
    );
    const root = await renderLoaded();
    const banner = findByType(root, "Banner");
    expect(banner).toBeTruthy();
    expect(banner?.props?.status).toBe("critical");
    expect(banner?.props?.title).toBe("Không thể tải mã thanh toán");
    const bannerText = getText(banner!);
    expect(bannerText).not.toContain("503");
    expect(bannerText).not.toContain("TINGEE_UNAVAILABLE");
    expect(bannerText).not.toContain("Debug");
  });

  it("shows a Retry button in the error state that re-fetches payment data", async () => {
    vi.mocked(fetchTingeeData).mockRejectedValueOnce(
      Object.assign(new Error("Service unavailable"), { code: "TINGEE_UNAVAILABLE", status: 503 })
    );
    const root = await renderLoaded();
    expect(findByType(root, "Banner")).toBeTruthy();

    vi.mocked(fetchTingeeData).mockResolvedValue(pendingData);
    const retryButton = findByType(root, "Button");
    expect(retryButton).toBeTruthy();

    await act(async () => {
      (retryButton!.props as { onPress: () => void }).onPress();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(findByType(root, "Banner")).toBeUndefined();
    expect(findByText(root, "1.500.000 đ")).toBeTruthy();
  });

  it("renders CountdownTimer in PENDING state", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(pendingData);
    const root = await renderLoaded();
    expect(findByType(root, "mock-countdown")).toBeTruthy();
  });

  it("transitions to EXPIRED state when CountdownTimer fires onExpire", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(pendingData);
    const root = await renderLoaded({ ...defaultProps, locale: "vi" });
    const countdown = findByType(root, "mock-countdown");
    expect(countdown).toBeTruthy();
    await act(async () => {
      (countdown!.props as { onExpire: () => void }).onExpire();
    });
    expect(findByText(root, "Mã QR đã hết hạn sau 15 phút.")).toBeTruthy();
  });

  it("shows expiredMessage when status is EXPIRED", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(pendingData);
    vi.mocked(usePaymentStatus).mockReturnValue({
      status: "EXPIRED",
      paidAt: undefined,
      showConnectionToast: false,
    });
    const root = await renderLoaded({ ...defaultProps, locale: "vi" });
    expect(findByText(root, "Mã QR đã hết hạn sau 15 phút.")).toBeTruthy();
  });

  it("does not render the PENDING QR/amount UI in EXPIRED state", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(pendingData);
    vi.mocked(usePaymentStatus).mockReturnValue({
      status: "EXPIRED",
      paidAt: undefined,
      showConnectionToast: false,
    });
    const root = await renderLoaded({ ...defaultProps, locale: "vi" });
    expect(findByType(root, "Image")).toBeUndefined();
    expect(findByText(root, "Chờ thanh toán")).toBeUndefined();
  });

  it("AC5: restores EXPIRED UI immediately from cache without flicker", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(pendingData);
    vi.mocked(usePaymentStatus).mockReturnValue({
      status: "EXPIRED",
      paidAt: undefined,
      showConnectionToast: false,
    });
    const root = await renderLoaded({ ...defaultProps, locale: "vi" });
    expect(findByText(root, "Mã QR đã hết hạn sau 15 phút.")).toBeTruthy();
    expect(findByText(root, "Chờ thanh toán")).toBeUndefined();
  });
});
