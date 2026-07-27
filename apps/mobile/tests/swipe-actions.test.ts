import {
  SWIPE_ACTION_WIDTH,
  batchSwipeActions,
  itemSwipeActions,
  type BatchSwipeAction,
  type ItemSwipeAction,
  type ShopAccess,
  type SwipeItem,
} from "../lib/swipe-actions";

const available: SwipeItem = { status: "available", publishedAt: null };
const sold: SwipeItem = { status: "sold", publishedAt: null };
const published: SwipeItem = { status: "available", publishedAt: new Date("2026-07-01T00:00:00Z") };

const seller: ShopAccess = { pro: true, hasShop: true };
const free: ShopAccess = { pro: false, hasShop: false };

const keys = (as: readonly { key: string }[]) => as.map((a) => a.key);
const byKey = <T extends { key: string }>(as: readonly T[], key: string): T => {
  const hit = as.find((a) => a.key === key);
  if (!hit) throw new Error(`no ${key} action in [${keys(as).join(", ")}]`);
  return hit;
};

// ---------------------------------------------------------------------------
// Which actions exist
// ---------------------------------------------------------------------------

test("an available item offers Mark sold, and nothing else without a shop", () => {
  expect(keys(itemSwipeActions(available, free))).toEqual(["markSold"]);
});

test("a sold item offers Undo sold instead of Mark sold", () => {
  expect(keys(itemSwipeActions(sold, free))).toEqual(["undoSold"]);
});

test("publish appears only for a Pro seller who actually has a shop", () => {
  expect(keys(itemSwipeActions(available, seller))).toContain("publish");
  expect(keys(itemSwipeActions(available, { pro: true, hasShop: false }))).not.toContain("publish");
  expect(keys(itemSwipeActions(available, { pro: false, hasShop: true }))).not.toContain("publish");
});

test("a published item offers Unpublish, never Publish", () => {
  const as = keys(itemSwipeActions(published, seller));
  expect(as).toContain("unpublish");
  expect(as).not.toContain("publish");
});

// A seller whose Pro lapsed, or who is offline before the shop profile has been
// cached, must still be able to take stock off a public page they no longer
// control. Mirrors the item-detail toggle's shipped rule (canToggle = published
// || canPublish) — putting something up needs a shop, taking it down does not.
test("Unpublish survives a lapsed subscription or an unknown shop", () => {
  expect(keys(itemSwipeActions(published, free))).toContain("unpublish");
});

test("a sold item can still be taken off the shop", () => {
  expect(keys(itemSwipeActions({ status: "sold", publishedAt: new Date() }, seller))).toEqual(["undoSold", "unpublish"]);
});

// ---------------------------------------------------------------------------
// Where they sit and how they look
// ---------------------------------------------------------------------------

test("the sold toggle is the left/primary action and publishing is the right one", () => {
  const as = itemSwipeActions(available, seller);
  expect(byKey(as, "markSold").side).toBe("left");
  expect(byKey(as, "markSold").tone).toBe("primary");
  expect(byKey(as, "publish").side).toBe("right");
});

test("unpublish is the danger tone; publishing is not", () => {
  expect(byKey(itemSwipeActions(published, seller), "unpublish").tone).toBe("danger");
  expect(byKey(itemSwipeActions(available, seller), "publish").tone).toBe("primary");
});

test("no side ever carries more than one action", () => {
  const cases: [SwipeItem, ShopAccess][] = [
    [available, free], [available, seller], [sold, free], [sold, seller],
    [published, free], [published, seller], [{ status: "sold", publishedAt: new Date() }, seller],
  ];
  for (const [item, shop] of cases) {
    const as = itemSwipeActions(item, shop);
    expect(as.filter((a) => a.side === "left").length).toBeLessThanOrEqual(1);
    expect(as.filter((a) => a.side === "right").length).toBeLessThanOrEqual(1);
  }
});

test("every action is labelled and iconed", () => {
  const as: { label: string; icon: string }[] = [
    ...itemSwipeActions(published, seller),
    ...itemSwipeActions(available, seller),
    ...batchSwipeActions(),
  ];
  for (const a of as) {
    expect(a.label.length).toBeGreaterThan(0);
    expect(a.icon.length).toBeGreaterThan(0);
  }
});

// ---------------------------------------------------------------------------
// The safety contract — a stray gesture must never be silently irreversible
// ---------------------------------------------------------------------------

test("everything that writes carries a confirm or an undo", () => {
  const writes: (ItemSwipeAction | BatchSwipeAction)[] = [
    ...itemSwipeActions(available, seller),
    ...itemSwipeActions(sold, seller),
    ...itemSwipeActions(published, seller),
    ...batchSwipeActions().filter((a) => a.key !== "addItem"),
  ];
  expect(writes.length).toBeGreaterThan(0);
  for (const a of writes) expect(["confirm", "undo"]).toContain(a.guard);
});

// Taking a listing off the internet is not something a toast can make right if
// the user looks away; deleting a batch takes its items and photos with it; and
// undoing a sale throws away the price AND the date it sold on, which no undo
// can hand back honestly (re-marking it stamps today).
test("anything a toast cannot honestly reverse demands a confirmation", () => {
  expect(byKey(itemSwipeActions(published, seller), "unpublish").guard).toBe("confirm");
  expect(byKey(batchSwipeActions(), "deleteBatch").guard).toBe("confirm");
  expect(byKey(itemSwipeActions(sold, seller), "undoSold").guard).toBe("confirm");
});

// Marking sold writes exactly what un-marking clears, so the undo is a true
// inverse and a dialog would only be in the way on a market floor.
test("perfectly reversible writes take an undo instead of nagging with a dialog", () => {
  expect(byKey(itemSwipeActions(available, seller), "markSold").guard).toBe("undo");
  expect(byKey(itemSwipeActions(available, seller), "publish").guard).toBe("undo");
});

// Only actions that write nothing at all may go unguarded.
test("the one unguarded action writes nothing — it just navigates", () => {
  const unguarded = batchSwipeActions().filter((a) => a.guard === "none");
  expect(keys(unguarded)).toEqual(["addItem"]);
});

// ---------------------------------------------------------------------------
// Batch cards
// ---------------------------------------------------------------------------

test("a batch card offers Add item on the left and Delete on the right", () => {
  const as = batchSwipeActions();
  expect(byKey(as, "addItem").side).toBe("left");
  expect(byKey(as, "addItem").tone).toBe("primary");
  expect(byKey(as, "deleteBatch").side).toBe("right");
  expect(byKey(as, "deleteBatch").tone).toBe("danger");
});

// ---------------------------------------------------------------------------
// Hit area
// ---------------------------------------------------------------------------

test("an action panel is at least a 44pt target wide", () => {
  expect(SWIPE_ACTION_WIDTH).toBeGreaterThanOrEqual(44);
});
