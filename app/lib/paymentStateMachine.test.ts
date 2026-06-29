import { describe, it, expect } from "vitest";
import { assertValidTransition } from "./paymentStateMachine";

describe("assertValidTransition", () => {
  it("PENDING → PROCESSING is valid", () => {
    expect(() => assertValidTransition("PENDING", "PROCESSING")).not.toThrow();
  });

  it("PENDING → EXPIRED is valid", () => {
    expect(() => assertValidTransition("PENDING", "EXPIRED")).not.toThrow();
  });

  it("PROCESSING → SUCCESS is valid", () => {
    expect(() => assertValidTransition("PROCESSING", "SUCCESS")).not.toThrow();
  });

  it("PROCESSING → FAILED is valid", () => {
    expect(() => assertValidTransition("PROCESSING", "FAILED")).not.toThrow();
  });

  it("SUCCESS → anything throws (terminal state)", () => {
    expect(() => assertValidTransition("SUCCESS", "PENDING")).toThrow(
      "Invalid payment transition: SUCCESS → PENDING"
    );
    expect(() => assertValidTransition("SUCCESS", "FAILED")).toThrow();
  });

  it("FAILED → anything throws (terminal state)", () => {
    expect(() => assertValidTransition("FAILED", "PENDING")).toThrow(
      "Invalid payment transition: FAILED → PENDING"
    );
    expect(() => assertValidTransition("FAILED", "SUCCESS")).toThrow();
  });

  it("PENDING → SUCCESS throws (invalid — skip PROCESSING)", () => {
    expect(() => assertValidTransition("PENDING", "SUCCESS")).toThrow(
      "Invalid payment transition: PENDING → SUCCESS"
    );
  });

  it("EXPIRED → anything throws (terminal state)", () => {
    expect(() => assertValidTransition("EXPIRED", "PENDING")).toThrow(
      "Invalid payment transition: EXPIRED → PENDING"
    );
  });

  it("PENDING → FAILED is valid (amount mismatch before PROCESSING)", () => {
    expect(() => assertValidTransition("PENDING", "FAILED")).not.toThrow();
  });
});
