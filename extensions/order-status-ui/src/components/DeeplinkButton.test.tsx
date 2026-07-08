// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createRemoteRoot } from "@remote-ui/core";
import { render } from "@remote-ui/react";
import { DeeplinkButton } from "./DeeplinkButton";

// <Button> from @shopify/ui-extensions-react/checkout is a remote-ui component
// (it accepts fragment/slot props), so it can only mount inside a real
// remote-ui RenderContext — @testing-library/react's DOM-based render() throws
// "No remote-ui Render instance found in context" for it. Rendering directly
// via @remote-ui/react's render() into a createRemoteRoot() mirrors what
// Shopify's own `reactExtension()` does in production, and lets us assert
// against the serialized component tree instead of the DOM.
async function renderRemote(element: React.ReactElement) {
  const root = createRemoteRoot(() => {});
  await new Promise<void>((resolve) => render(element, root, () => resolve()));
  return root;
}

describe("DeeplinkButton", () => {
  it("renders null when deeplinkUrl is null", async () => {
    const root = await renderRemote(
      <DeeplinkButton deeplinkUrl={null} locale="vi" />
    );
    expect(root.children).toHaveLength(0);
  });

  it("renders a secondary Button linking to deeplinkUrl when set", async () => {
    const root = await renderRemote(
      <DeeplinkButton deeplinkUrl="tingpay://pay/abc123" locale="vi" />
    );
    const button = root.children[0] as any;
    expect(button.type).toBe("Button");
    expect(button.props).toEqual({ to: "tingpay://pay/abc123", kind: "secondary" });
  });

  it("renders Vietnamese button text", async () => {
    const root = await renderRemote(
      <DeeplinkButton deeplinkUrl="tingpay://pay/abc123" locale="vi" />
    );
    const button = root.children[0] as any;
    expect(button.children[0].text).toBe("Mở app ngân hàng");
  });

  it("renders English button text", async () => {
    const root = await renderRemote(
      <DeeplinkButton deeplinkUrl="tingpay://pay/abc123" locale="en" />
    );
    const button = root.children[0] as any;
    expect(button.children[0].text).toBe("Open bank app");
  });
});
