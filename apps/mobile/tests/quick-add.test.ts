import { QUICK_ADD_ROUTE } from "../lib/quick-add";

test("quick-add opens the batch-less composer", () => {
  expect(QUICK_ADD_ROUTE).toBe("/item/new");
});
