import type { ReactElement } from "react";
import { createRemoteRoot } from "@remote-ui/core";
import { render } from "@remote-ui/react";
import type { RemoteRoot } from "@remote-ui/core";

// Components from @shopify/ui-extensions-react/checkout that accept fragment/slot
// props (e.g. <Button>) are wrapped by @remote-ui/react's ComponentWrapper, which
// requires a real remote-ui RenderContext — @testing-library/react's DOM-based
// render() never provides one, so mounting these via jsdom throws "No remote-ui
// Render instance found in context". Rendering through @remote-ui/react's own
// render() into a createRemoteRoot() mirrors what Shopify's `reactExtension()`
// does in production, and gives back a serializable component tree to assert
// against instead of a DOM.
export async function renderRemote(element: ReactElement): Promise<RemoteRoot> {
  const root = createRemoteRoot(() => {});
  await new Promise<void>((resolve) => render(element, root, () => resolve()));
  return root;
}

type RemoteNode = {
  kind?: number;
  type?: string;
  text?: string;
  props?: Record<string, unknown>;
  children?: readonly RemoteNode[];
};

const KIND_TEXT = 2;

export function findAllByType(root: RemoteRoot, type: string): RemoteNode[] {
  const results: RemoteNode[] = [];
  const visit = (nodes: readonly RemoteNode[]) => {
    for (const node of nodes) {
      if (node.type === type) results.push(node);
      if (node.children) visit(node.children);
    }
  };
  visit(root.children as readonly RemoteNode[]);
  return results;
}

export function findByType(root: RemoteRoot, type: string): RemoteNode | undefined {
  return findAllByType(root, type)[0];
}

export function getText(node: RemoteNode): string {
  if (node.kind === KIND_TEXT) return node.text ?? "";
  return (node.children ?? []).map(getText).join("");
}

export function findByText(root: RemoteRoot, text: string): RemoteNode | undefined {
  let found: RemoteNode | undefined;
  const visit = (nodes: readonly RemoteNode[]) => {
    for (const node of nodes) {
      if (found) return;
      if (node.kind !== KIND_TEXT && getText(node) === text) {
        found = node;
        return;
      }
      if (node.children) visit(node.children);
    }
  };
  visit(root.children as readonly RemoteNode[]);
  return found;
}
