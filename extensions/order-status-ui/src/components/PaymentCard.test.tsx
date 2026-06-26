// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { TingeeDataResponse } from "../api/client";

vi.mock("../api/client", () => ({
  fetchTingeeData: vi.fn(),
}));

vi.mock("@shopify/ui-extensions-react/customer-account", () => ({
  useColorScheme: vi.fn(() => "light"),
}));

vi.mock("../hooks/useMobileDetect", () => ({
  useMobileDetect: vi.fn(() => false),
}));

import { fetchTingeeData } from "../api/client";
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
    render(<PaymentCard {...defaultProps} locale="vi" />);
    await waitFor(() => {
      expect(screen.getByText("Đã thanh toán ✓")).toBeTruthy();
    });
    expect(screen.queryByText("Chờ thanh toán")).toBeNull();
  });

  it("renders Vietnamese text when locale is 'vi'", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(pendingData);
    render(<PaymentCard {...defaultProps} locale="vi" />);
    await waitFor(() => {
      expect(screen.getByText("Thanh toán qua Tingee QR")).toBeTruthy();
      expect(screen.getByText("Chờ thanh toán")).toBeTruthy();
    });
  });

  it("renders English text when locale is 'en'", async () => {
    vi.mocked(fetchTingeeData).mockResolvedValue(pendingData);
    render(<PaymentCard {...defaultProps} locale="en" />);
    await waitFor(() => {
      expect(screen.getByText("Pay with Tingee QR")).toBeTruthy();
      expect(screen.getByText("Awaiting payment")).toBeTruthy();
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
