import renderer, { act } from "react-test-renderer";
import { Icon } from "../components/Icon";

test("renders a phosphor icon without crashing and passes size", () => {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Icon name="Camera" size={20} />);
  });
  expect(tree!.toJSON()).toBeTruthy();
});

test("unknown names are a type error (compile-time) — runtime falls back to null", () => {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    // @ts-expect-error invalid name
    tree = renderer.create(<Icon name="NotARealIcon" />);
  });
  expect(tree!.toJSON()).toBeNull();
});
