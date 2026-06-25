import { describe, it, expect } from "vitest";
import { formatVndAmount } from "./formatters";

describe("formatVndAmount", () => {
  it("formats 1500000 as '1.500.000 đ'", () => {
    expect(formatVndAmount(1500000)).toBe("1.500.000 đ");
  });

  it("formats 50000 as '50.000 đ'", () => {
    expect(formatVndAmount(50000)).toBe("50.000 đ");
  });

  it("formats 1000 as '1.000 đ'", () => {
    expect(formatVndAmount(1000)).toBe("1.000 đ");
  });

  it("formats 500 as '500 đ'", () => {
    expect(formatVndAmount(500)).toBe("500 đ");
  });
});
