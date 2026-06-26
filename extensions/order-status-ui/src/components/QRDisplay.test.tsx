// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QRDisplay } from "./QRDisplay";

const defaultProps = {
  qrImageUrl: "https://example.com/qr.png",
  amount: 1500000,
  locale: "vi",
  isMobile: false,
};

describe("QRDisplay", () => {
  it("renders QR image on desktop", () => {
    render(<QRDisplay {...defaultProps} isMobile={false} />);
    const img = screen.getByAltText(/Mã QR thanh toán/);
    expect(img).toBeTruthy();
    expect((img as HTMLImageElement).src).toContain("qr.png");
  });

  it("renders correct Vietnamese alt text with formatted amount", () => {
    render(<QRDisplay {...defaultProps} isMobile={false} />);
    const img = screen.getByAltText("Mã QR thanh toán 1.500.000 đồng qua Tingee");
    expect(img).toBeTruthy();
  });

  it("renders correct English alt text when locale is en", () => {
    render(<QRDisplay {...defaultProps} locale="en" isMobile={false} />);
    const img = screen.getByAltText("QR code to pay 1.500.000 đ via Tingee");
    expect(img).toBeTruthy();
  });

  it("does NOT render tap-trigger button on desktop", () => {
    const { container } = render(<QRDisplay {...defaultProps} isMobile={false} />);
    expect(container.querySelector(".tng-qr-tap-trigger")).toBeNull();
  });

  it("renders tap-trigger button on mobile", () => {
    const { container } = render(<QRDisplay {...defaultProps} isMobile={true} />);
    expect(container.querySelector(".tng-qr-tap-trigger")).not.toBeNull();
  });

  it("opens lightbox when QR is tapped on mobile", () => {
    const { container } = render(<QRDisplay {...defaultProps} isMobile={true} />);
    const trigger = container.querySelector(".tng-qr-tap-trigger") as HTMLElement;
    fireEvent.click(trigger);
    expect(container.querySelector(".tng-lightbox")).not.toBeNull();
  });

  it("closes lightbox when backdrop is clicked", () => {
    const { container } = render(<QRDisplay {...defaultProps} isMobile={true} />);
    const trigger = container.querySelector(".tng-qr-tap-trigger") as HTMLElement;
    fireEvent.click(trigger);
    expect(container.querySelector(".tng-lightbox")).not.toBeNull();
    const lightbox = container.querySelector(".tng-lightbox") as HTMLElement;
    fireEvent.click(lightbox);
    expect(container.querySelector(".tng-lightbox")).toBeNull();
  });

  it("does NOT close lightbox when clicking the QR image inside lightbox", () => {
    const { container } = render(<QRDisplay {...defaultProps} isMobile={true} />);
    const trigger = container.querySelector(".tng-qr-tap-trigger") as HTMLElement;
    fireEvent.click(trigger);
    const innerContainer = container.querySelector(".tng-lightbox__qr-container") as HTMLElement;
    fireEvent.click(innerContainer);
    expect(container.querySelector(".tng-lightbox")).not.toBeNull();
  });

  it("does not render when qrImageUrl is undefined", () => {
    const { container } = render(
      <QRDisplay {...defaultProps} qrImageUrl={undefined} isMobile={false} />
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("does not render lightbox trigger on mobile when qrImageUrl is undefined", () => {
    const { container } = render(
      <QRDisplay {...defaultProps} qrImageUrl={undefined} isMobile={true} />
    );
    expect(container.querySelector(".tng-qr-tap-trigger")).toBeNull();
  });

  it("closes lightbox when Escape key is pressed", () => {
    const { container } = render(<QRDisplay {...defaultProps} isMobile={true} />);
    const trigger = container.querySelector(".tng-qr-tap-trigger") as HTMLElement;
    fireEvent.click(trigger);
    expect(container.querySelector(".tng-lightbox")).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelector(".tng-lightbox")).toBeNull();
  });
});
