// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders 'Đã thanh toán ✓' with success tone for COMPLETED", () => {
    const { container } = render(<StatusBadge status="COMPLETED" locale="vi" />);
    expect(screen.getByText("Đã thanh toán ✓")).toBeTruthy();
    expect(container.querySelector("badge")?.getAttribute("tone")).toBe("success");
  });

  it("renders 'Chờ thanh toán' with warning tone for PENDING", () => {
    const { container } = render(<StatusBadge status="PENDING" locale="vi" />);
    expect(screen.getByText("Chờ thanh toán")).toBeTruthy();
    expect(container.querySelector("badge")?.getAttribute("tone")).toBe("warning");
  });

  it("renders English text when locale is 'en'", () => {
    render(<StatusBadge status="COMPLETED" locale="en" />);
    expect(screen.getByText("Paid ✓")).toBeTruthy();
  });

  it("renders English pending text when locale is 'en'", () => {
    render(<StatusBadge status="PENDING" locale="en" />);
    expect(screen.getByText("Awaiting payment")).toBeTruthy();
  });

  it("renders EXPIRED badge with critical tone", () => {
    const { container } = render(<StatusBadge status="EXPIRED" locale="vi" />);
    expect(screen.getByText("Mã QR đã hết hạn")).toBeTruthy();
    expect(container.querySelector("badge")?.getAttribute("tone")).toBe("critical");
  });

  it("renders FAILED using critical tone", () => {
    const { container } = render(<StatusBadge status="FAILED" locale="vi" />);
    expect(container.querySelector("badge")?.getAttribute("tone")).toBe("critical");
  });
});
