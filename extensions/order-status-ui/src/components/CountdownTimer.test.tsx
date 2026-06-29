// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CountdownTimer } from "./CountdownTimer";

vi.mock("../hooks/useCountdown", () => ({
  useCountdown: vi.fn(),
}));

import { useCountdown } from "../hooks/useCountdown";

const defaultProps = {
  expiresAt: new Date(Date.now() + 900 * 1000).toISOString(),
  onExpire: vi.fn(),
  locale: "vi",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CountdownTimer", () => {
  it("renders '15:00' when secondsLeft=900", () => {
    vi.mocked(useCountdown).mockReturnValue({ secondsLeft: 900, isExpired: false });
    render(<CountdownTimer {...defaultProps} />);
    expect(screen.getByText("15:00")).toBeTruthy();
  });

  it("renders '01:01' when secondsLeft=61", () => {
    vi.mocked(useCountdown).mockReturnValue({ secondsLeft: 61, isExpired: false });
    render(<CountdownTimer {...defaultProps} />);
    expect(screen.getByText("01:01")).toBeTruthy();
  });

  it("renders nothing when isExpired=true", () => {
    vi.mocked(useCountdown).mockReturnValue({ secondsLeft: 0, isExpired: true });
    const { container } = render(<CountdownTimer {...defaultProps} />);
    expect(container.querySelector("p")).toBeNull();
  });

  it("has aria-live='off' on the p element", () => {
    vi.mocked(useCountdown).mockReturnValue({ secondsLeft: 900, isExpired: false });
    const { container } = render(<CountdownTimer {...defaultProps} />);
    const p = container.querySelector("p");
    expect(p?.getAttribute("aria-live")).toBe("off");
  });

  it("aria-label contains 'Thời gian còn lại' for locale 'vi'", () => {
    vi.mocked(useCountdown).mockReturnValue({ secondsLeft: 900, isExpired: false });
    render(<CountdownTimer {...defaultProps} locale="vi" />);
    const p = screen.getByText("15:00");
    expect(p.getAttribute("aria-label")).toContain("Thời gian còn lại");
  });

  it("aria-label contains 'Time remaining' for locale 'en'", () => {
    vi.mocked(useCountdown).mockReturnValue({ secondsLeft: 900, isExpired: false });
    render(<CountdownTimer {...defaultProps} locale="en" />);
    const p = screen.getByText("15:00");
    expect(p.getAttribute("aria-label")).toContain("Time remaining");
  });
});
