// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders 'Đã thanh toán ✓' with paid class for COMPLETED", () => {
    const { container } = render(<StatusBadge status="COMPLETED" locale="vi" />);
    expect(screen.getByText("Đã thanh toán ✓")).toBeTruthy();
    expect(container.querySelector(".tng-status-badge--paid")).not.toBeNull();
  });

  it("renders 'Chờ thanh toán' with pending class for PENDING", () => {
    const { container } = render(<StatusBadge status="PENDING" locale="vi" />);
    expect(screen.getByText("Chờ thanh toán")).toBeTruthy();
    expect(container.querySelector(".tng-status-badge--pending")).not.toBeNull();
  });

  it("has aria-live='polite' on the container div", () => {
    const { container } = render(<StatusBadge status="PENDING" locale="vi" />);
    const wrapper = container.querySelector(".tng-status-badge-container");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute("aria-live")).toBe("polite");
  });

  it("renders English text when locale is 'en'", () => {
    render(<StatusBadge status="COMPLETED" locale="en" />);
    expect(screen.getByText("Paid ✓")).toBeTruthy();
  });

  it("renders English pending text when locale is 'en'", () => {
    render(<StatusBadge status="PENDING" locale="en" />);
    expect(screen.getByText("Awaiting payment")).toBeTruthy();
  });

  it("renders EXPIRED badge", () => {
    const { container } = render(<StatusBadge status="EXPIRED" locale="vi" />);
    expect(screen.getByText("Mã QR đã hết hạn")).toBeTruthy();
    expect(container.querySelector(".tng-status-badge--expired")).not.toBeNull();
  });

  it("renders FAILED using pending style (non-alarming)", () => {
    const { container } = render(<StatusBadge status="FAILED" locale="vi" />);
    expect(container.querySelector(".tng-status-badge--pending")).not.toBeNull();
  });
});
