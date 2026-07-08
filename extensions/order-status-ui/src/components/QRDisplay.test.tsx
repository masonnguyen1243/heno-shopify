// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { QRDisplay } from "./QRDisplay";

const defaultProps = {
  qrImageUrl: "https://example.com/qr.png",
  amount: 1500000,
  locale: "vi",
};

describe("QRDisplay", () => {
  it("renders QR image with the given source", () => {
    const { container } = render(<QRDisplay {...defaultProps} />);
    const img = container.querySelector("image");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("source")).toBe("https://example.com/qr.png");
  });

  it("renders correct Vietnamese accessibility description with formatted amount", () => {
    const { container } = render(<QRDisplay {...defaultProps} />);
    const img = container.querySelector("image");
    expect(img?.getAttribute("accessibilitydescription")).toBe(
      "Mã QR thanh toán 1.500.000 đồng qua Tingee"
    );
  });

  it("renders correct English accessibility description when locale is en", () => {
    const { container } = render(<QRDisplay {...defaultProps} locale="en" />);
    const img = container.querySelector("image");
    expect(img?.getAttribute("accessibilitydescription")).toBe(
      "QR code to pay 1.500.000 đ via Tingee"
    );
  });

  it("does not render when qrImageUrl is undefined", () => {
    const { container } = render(
      <QRDisplay {...defaultProps} qrImageUrl={undefined} />
    );
    expect(container.querySelector("image")).toBeNull();
  });
});
