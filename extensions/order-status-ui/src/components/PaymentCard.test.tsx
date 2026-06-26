// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { TingeeDataResponse } from "../api/client";

vi.mock("../api/client", () => ({
  fetchTingeeData: vi.fn(),
  fetchPaymentStatus: vi.fn(),
}));

vi.mock("@shopify/ui-extensions-react/customer-account", () => ({
  useColorScheme: vi.fn(() => "light"),
}));

vi.mock("../hooks/useMobileDetect", () => ({
  useMobileDetect: vi.fn(() => false),
}));

vi.mock("../hooks/usePaymentStatus", () => ({
  usePaymentStatus: vi.fn(() => ({ status: null, paidAt: undefined, showConnectionToast: false })),
}));

vi.mock("./StatusBadge", () => ({
  StatusBadge: ({ status }: { status: string }) => (
    <span data-testid="status-badge">{status}</span>
  ),
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PaymentCard", () => {
  it("renders loading skeleton before data loads", () => {
    vi.mocked(fetchTingeeData).mockReturnValue(new Promise(() => {}));
    const { container } = render(<PaymentCard {...defaultProps} />);
    expect(container.querySelector(".tng-skeleton--qr")).not.toBeNull();
    expect(container.querySelector(".tng-skeleton--amount")).not.toBeNull();
  });

  it("has data-tng-extension attribute on wrapper", () => {
    vi.mocked(fetchTingeeData).mockReturnValue(new Promise(() => {}));
    const { container } = render(<PaymentCard {...defaultProps} />);
    expect(container.querySelector("[data-tng-extension]")).not.toBeNull();
  });

  it("renders amount '1.500.000 đ' when data loaded", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(pendingData);
    render(<PaymentCard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("1.500.000 đ")).toBeTruthy();
    });
  });

  it("renders success state directly when status is COMPLETED (no flash)", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(completedData);
    vi.mocked(usePaymentStatus).mockReturnValue({ status: "COMPLETED", paidAt: undefined, showConnectionToast: false });
    render(<PaymentCard {...defaultProps} locale="vi" />);
    await waitFor(() => {
      expect(screen.getByText("COMPLETED")).toBeTruthy(); // StatusBadge mock
    });
    expect(screen.queryByText("Chờ thanh toán")).toBeNull();
  });

  it("shows paidConfirmMessage when polled status is COMPLETED", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(pendingData);
    vi.mocked(usePaymentStatus).mockReturnValue({ status: "COMPLETED", paidAt: undefined, showConnectionToast: false });
    render(<PaymentCard {...defaultProps} locale="vi" />);
    await waitFor(() => {
      expect(screen.getByText("Đơn hàng của bạn đã được xác nhận. Cảm ơn!")).toBeTruthy();
    });
  });

  it("shows connection toast when showConnectionToast is true", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(pendingData);
    vi.mocked(usePaymentStatus).mockReturnValue({ status: "PENDING", paidAt: undefined, showConnectionToast: true });
    render(<PaymentCard {...defaultProps} locale="vi" />);
    await waitFor(() => {
      expect(screen.getByText("Đang kiểm tra kết nối...")).toBeTruthy();
    });
  });

  it("renders Vietnamese text when locale is 'vi'", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(pendingData);
    render(<PaymentCard {...defaultProps} locale="vi" />);
    await waitFor(() => {
      expect(screen.getByText("Thanh toán qua Tingee QR")).toBeTruthy();
      expect(screen.getByText("PENDING")).toBeTruthy(); // StatusBadge mock renders status text
    });
  });

  it("renders English text when locale is 'en'", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(pendingData);
    render(<PaymentCard {...defaultProps} locale="en" />);
    await waitFor(() => {
      expect(screen.getByText("Pay with Tingee QR")).toBeTruthy();
    });
  });

  it("renders fallback UI (no crash) when fetchTingeeData returns HTTP 503", async () => {
    vi.mocked(fetchTingeeData).mockRejectedValue(
      Object.assign(new Error("Service unavailable"), { code: "TINGEE_UNAVAILABLE", status: 503 })
    );
    render(<PaymentCard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Đang kiểm tra kết nối...")).toBeTruthy();
    });
  });
});
