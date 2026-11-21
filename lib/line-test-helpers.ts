// Test-only walkers over Flex Message JSON. Deliberately not named *.test.ts
// so vitest only loads it when a test imports it.
export type Node = Record<string, unknown>;

export function walk(root: unknown, visit: (n: Node) => void): void {
  if (Array.isArray(root)) {
    root.forEach((n) => walk(n, visit));
    return;
  }
  if (root && typeof root === "object") {
    visit(root as Node);
    Object.values(root as Node).forEach((v) => walk(v, visit));
  }
}

export function findNode(root: unknown, pred: (n: Node) => boolean): Node | undefined {
  let found: Node | undefined;
  walk(root, (n) => {
    if (!found && pred(n)) found = n;
  });
  return found;
}

// Every `text` of a text node (Flex text components and plain text messages).
export function texts(root: unknown): string[] {
  const out: string[] = [];
  walk(root, (n) => {
    if (n.type === "text" && typeof n.text === "string") out.push(n.text);
  });
  return out;
}

export interface Act {
  type: string;
  label: string;
  data: Record<string, string>;
  uri: string;
}

// Every postback / uri / clipboard action (buttons, tappable boxes, hero,
// quick reply items), with postback data decoded.
export function actions(root: unknown): Act[] {
  const out: Act[] = [];
  walk(root, (n) => {
    if ((n.type === "postback" || n.type === "uri" || n.type === "clipboard") && typeof n.label === "string") {
      out.push({
        type: n.type,
        label: n.label,
        data: typeof n.data === "string" ? Object.fromEntries(new URLSearchParams(n.data)) : {},
        uri: typeof n.uri === "string" ? n.uri : "",
      });
    }
  });
  return out;
}

export const labels = (root: unknown): string[] => actions(root).map((a) => a.label);

export function hasEmptyText(root: unknown): boolean {
  let bad = false;
  walk(root, (n) => {
    if (n.type === "text" && (typeof n.text !== "string" || n.text === "")) bad = true;
  });
  return bad;
}
