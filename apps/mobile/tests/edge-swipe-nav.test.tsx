import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { Text } from "react-native";

const mockNavigate = jest.fn();
let mockPathname = "/inventory";
jest.mock("expo-router", () => ({
  useRouter: () => ({ navigate: mockNavigate }),
  usePathname: () => mockPathname,
}));

import { EdgeSwipeNav } from "../components/EdgeSwipeNav";

let tree: ReactTestRenderer | null = null;
afterEach(() => {
  act(() => { tree?.unmount(); });
  tree = null;
  mockNavigate.mockClear();
  mockPathname = "/inventory";
});

function texts(t: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (node == null) return;
    if (typeof node === "string") { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    walk((node as { children?: unknown }).children);
  };
  walk(t.toJSON());
  return out;
}

test("renders its children unchanged — the gesture layer is invisible", () => {
  act(() => {
    tree = renderer.create(
      <EdgeSwipeNav>
        <Text>Inventory</Text>
      </EdgeSwipeNav>,
    );
  });
  expect(texts(tree!)).toContain("Inventory");
});

test("never navigates on its own — mounting does not call router.navigate", () => {
  act(() => {
    tree = renderer.create(
      <EdgeSwipeNav>
        <Text>Inventory</Text>
      </EdgeSwipeNav>,
    );
  });
  expect(mockNavigate).not.toHaveBeenCalled();
});
