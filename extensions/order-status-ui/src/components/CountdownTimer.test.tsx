// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
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
  it("renders '15:00' digital format with Vietnamese label when secondsLeft=900", () => {
    vi.mocked(useCountdown).mockReturnValue({ secondsLeft: 900, isExpired: false });
    const { container } = render(<CountdownTimer {...defaultProps} />);
    expect(container.querySelector("text")?.textContent).toBe(
      "Còn lại: 15 phút 0 giây — 15:00"
    );
  });

  it("renders '01:01' digital format when secondsLeft=61", () => {
    vi.mocked(useCountdown).mockReturnValue({ secondsLeft: 61, isExpired: false });
    const { container } = render(<CountdownTimer {...defaultProps} />);
    expect(container.querySelector("text")?.textContent).toBe(
      "Còn lại: 1 phút 1 giây — 01:01"
    );
  });

  it("renders English label when locale is 'en'", () => {
    vi.mocked(useCountdown).mockReturnValue({ secondsLeft: 900, isExpired: false });
    const { container } = render(<CountdownTimer {...defaultProps} locale="en" />);
    expect(container.querySelector("text")?.textContent).toBe(
      "Expires in: 15m 0s — 15:00"
    );
  });

  it("renders nothing when isExpired=true", () => {
    vi.mocked(useCountdown).mockReturnValue({ secondsLeft: 0, isExpired: true });
    const { container } = render(<CountdownTimer {...defaultProps} />);
    expect(container.querySelector("text")).toBeNull();
  });
});
