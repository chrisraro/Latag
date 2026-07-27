import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { Pressable, View } from "react-native";

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: "medium" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

import * as Haptics from "expo-haptics";
import {
  Segmented,
  SegmentedView,
  resolveSegmentedUI,
  type SegmentedOption,
  type SegmentedUI,
} from "../components/native/Segmented";

type Mode = "all" | "available" | "sold";

const OPTIONS: SegmentedOption<Mode>[] = [
  { value: "all", label: "All" },
  { value: "available", label: "Available" },
  { value: "sold", label: "Sold" },
];

beforeEach(() => {
  jest.clearAllMocks();
});

/** A working stand-in for the slice of `@expo/ui/jetpack-compose` this
 *  component uses, built from RN primitives so react-test-renderer can inspect
 *  the native path exactly like it inspects the chip fallback. */
function stubSegmentedUI(): SegmentedUI {
  const SegmentedButton = ({
    children,
    selected,
    onClick,
  }: {
    children?: React.ReactNode;
    selected?: boolean;
    onClick?: () => void;
  }) => (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={onClick}>
      {children}
    </Pressable>
  );
  SegmentedButton.Label = ({ children }: { children: React.ReactNode }) => <View>{children}</View>;
  return {
    Host: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    SingleChoiceSegmentedButtonRow: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    SegmentedButton,
    // The Compose `Text` takes its content as children and its colour as a prop;
    // the stub keeps both visible to the tree walker.
    Text: ({ children, color }: { children?: React.ReactNode; color?: string }) => (
      <View accessibilityLabel={String(children)} accessibilityHint={color} />
    ),
  } as unknown as SegmentedUI;
}

function render(tree: React.ReactElement): ReactTestRenderer {
  let t: ReactTestRenderer;
  act(() => { t = renderer.create(tree); });
  return t!;
}

function collectTexts(node: any, out: string[] = []): string[] {
  for (const child of node.children ?? []) {
    if (typeof child === "string") out.push(child);
    else collectTexts(child, out);
  }
  return out;
}

/** Every pressable control in the tree, in render order, paired with the label
 *  it presents — a rendered string for the chips, an a11y label for the stub. */
function controls(t: ReactTestRenderer): { label: string; selected: boolean | undefined; press: () => void }[] {
  return t.root
    .findAll((n) => typeof n.props?.onPress === "function" && n.props?.accessibilityRole === "button")
    .map((n) => {
      const inner = collectTexts(n);
      const viaA11y = n.findAll((d) => typeof d.props?.accessibilityLabel === "string");
      return {
        label: inner.length > 0 ? inner[0] : (viaA11y[0]?.props.accessibilityLabel as string),
        selected: (n.props.accessibilityState as { selected?: boolean } | undefined)?.selected,
        press: () => act(() => { n.props.onPress(); }),
      };
    });
}

describe("resolveSegmentedUI — the capability check", () => {
  test("never attempts the native module off Android", () => {
    // SwiftUI's `Picker` is the nearest equivalent, but it takes no colours —
    // only a `tint` modifier — so it cannot carry the Warehouse Console tokens.
    // iOS therefore keeps the chips on purpose, not by accident.
    const loader = jest.fn();
    expect(resolveSegmentedUI("ios", loader)).toBeNull();
    expect(loader).not.toHaveBeenCalled();
  });

  test("falls back when the native module fails to load on Android", () => {
    const loader = jest.fn(() => {
      throw new Error("native view manager not linked");
    });
    expect(resolveSegmentedUI("android", loader)).toBeNull();
  });

  test("falls back when the loaded module is missing required exports", () => {
    expect(resolveSegmentedUI("android", () => ({}) as SegmentedUI)).toBeNull();
    const partial = { Host: () => null, SegmentedButton: () => null } as unknown as SegmentedUI;
    expect(resolveSegmentedUI("android", () => partial)).toBeNull();
  });

  test("resolves the module when it loads with every required export on Android", () => {
    const ui = stubSegmentedUI();
    expect(resolveSegmentedUI("android", () => ui)).toBe(ui);
  });
});

describe("SegmentedView — the chip fallback is mandatory", () => {
  test("renders one chip per option when the native module is unavailable", () => {
    const t = render(<SegmentedView label="Status" options={OPTIONS} value="all" onChange={jest.fn()} ui={null} />);
    expect(controls(t).map((c) => c.label)).toEqual(["All", "Available", "Sold"]);
  });

  test("marks only the current value selected", () => {
    const t = render(<SegmentedView label="Status" options={OPTIONS} value="sold" onChange={jest.fn()} ui={null} />);
    expect(controls(t).map((c) => c.selected)).toEqual([false, false, true]);
  });

  test("tapping a chip reports its value", () => {
    const onChange = jest.fn();
    const t = render(<SegmentedView label="Status" options={OPTIONS} value="all" onChange={onChange} ui={null} />);
    controls(t)[1].press();
    expect(onChange).toHaveBeenCalledWith("available");
  });

  test("re-tapping the current value does not re-report it", () => {
    // The screens hang query re-runs off these callbacks; a no-op tap must not
    // churn the list.
    const onChange = jest.fn();
    const t = render(<SegmentedView label="Status" options={OPTIONS} value="all" onChange={onChange} ui={null} />);
    controls(t)[0].press();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("a native module that resolves but throws while rendering still lands on the chips", () => {
    const poisoned = new Proxy(
      {},
      {
        get() {
          throw new Error("native module blew up on use");
        },
      },
    ) as unknown as SegmentedUI;
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const t = render(<SegmentedView label="Status" options={OPTIONS} value="all" onChange={jest.fn()} ui={poisoned} />);
    expect(controls(t).map((c) => c.label)).toEqual(["All", "Available", "Sold"]);
    errorSpy.mockRestore();
  });
});

describe("SegmentedView — native path", () => {
  const ui = stubSegmentedUI();

  test("renders one segment per option, labelled and with only the current one selected", () => {
    const t = render(<SegmentedView label="Status" options={OPTIONS} value="available" onChange={jest.fn()} ui={ui} />);
    const found = controls(t);
    expect(found.map((c) => c.label)).toEqual(["All", "Available", "Sold"]);
    expect(found.map((c) => c.selected)).toEqual([false, true, false]);
  });

  test("tapping a segment reports its value and buzzes", () => {
    const onChange = jest.fn();
    const t = render(<SegmentedView label="Sort" options={OPTIONS} value="all" onChange={onChange} ui={ui} />);
    controls(t)[2].press();
    expect(onChange).toHaveBeenCalledWith("sold");
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  test("re-tapping the current segment is inert", () => {
    const onChange = jest.fn();
    const t = render(<SegmentedView label="Sort" options={OPTIONS} value="sold" onChange={onChange} ui={ui} />);
    controls(t)[2].press();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("labels are painted with the Warehouse Console tokens, not Material's defaults", () => {
    // The whole reason this control is allowed to go native: `SegmentedButton`
    // takes a full `colors` object and the Compose `Text` takes a colour, so
    // acid-on-near-black survives. If that ever stops being true the control
    // must go back to being custom.
    const t = render(<SegmentedView label="Status" options={OPTIONS} value="all" onChange={jest.fn()} ui={ui} />);
    // `n.type === View` matches only the composite instance — without it the
    // host node underneath resolves to the same props and every tint is
    // counted twice.
    const tints = t.root
      .findAll((n) => n.type === View && typeof n.props?.accessibilityHint === "string")
      .map((n) => n.props.accessibilityHint);
    expect(tints).toEqual(["#141A05", "#ADADAD", "#ADADAD"]);
  });
});

describe("Segmented — the wired-up export", () => {
  test("renders the chips under Jest (iOS), where the native row is never reached", () => {
    const t = render(<Segmented label="Status" options={OPTIONS} value="all" onChange={jest.fn()} />);
    expect(controls(t).map((c) => c.label)).toEqual(["All", "Available", "Sold"]);
  });
});
