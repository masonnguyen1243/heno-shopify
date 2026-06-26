// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../utils/deeplink", () => ({
  openDeeplink: vi.fn(() => () => {}),
}));

import { openDeeplink } from "../utils/deeplink";
import { DeeplinkButton } from "./DeeplinkButton";

const defaultProps = {
  deeplinkUrl: "tingpay://pay/abc123",
  amount: 1500000,
  locale: "vi",
  isMobile: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DeeplinkButton", () => {
  it("renders null when isMobile is false", () => {
    const { container } = render(<DeeplinkButton {...defaultProps} isMobile={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders null when deeplinkUrl is null", () => {
    const { container } = render(<DeeplinkButton {...defaultProps} deeplinkUrl={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders button when isMobile=true and deeplinkUrl is set", () => {
    render(<DeeplinkButton {...defaultProps} />);
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("renders Vietnamese button text", () => {
    render(<DeeplinkButton {...defaultProps} locale="vi" />);
    expect(screen.getByText("Mở app ngân hàng")).toBeTruthy();
  });

  it("renders English button text", () => {
    render(<DeeplinkButton {...defaultProps} locale="en" />);
    expect(screen.getByText("Open bank app")).toBeTruthy();
  });

  it("has correct Vietnamese aria-label with formatted amount (no đ suffix duplication)", () => {
    render(<DeeplinkButton {...defaultProps} locale="vi" amount={1500000} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toBe(
      "Mở app ngân hàng để thanh toán 1.500.000 đồng"
    );
  });

  it("has correct English aria-label with formatted amount", () => {
    render(<DeeplinkButton {...defaultProps} locale="en" amount={1500000} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toBe(
      "Open bank app to pay 1.500.000 đồng"
    );
  });

  it("calls openDeeplink with the URL and onFallback when clicked", () => {
    const onFallback = vi.fn();
    render(<DeeplinkButton {...defaultProps} onFallback={onFallback} />);
    fireEvent.click(screen.getByRole("button"));
    expect(openDeeplink).toHaveBeenCalledWith("tingpay://pay/abc123", expect.any(Function));
  });
});
