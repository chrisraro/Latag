import type { IconName } from "../components/Icon";

/**
 * What a row offers when you drag it, decided in one place.
 *
 * Availability is a product rule, not a rendering detail: whether an item can
 * be published depends on a subscription and a shop the row knows nothing
 * about, and getting it wrong means a swipe that silently does nothing or —
 * worse — one that publishes stock for a seller with no storefront. So no
 * component decides this inline; they all ask here and render what comes back.
 *
 * Pure by construction: no db, no components, no react. The screens own the
 * doing; this module only says what may be done.
 */

/** Drag right reveals `left`; drag left reveals `right`. */
export type SwipeSide = "left" | "right";

/** `primary` is acid on ink; `danger` is the red reserved for loss. */
export type SwipeTone = "primary" | "danger";

/**
 * How a stray gesture is made safe.
 *
 * - `confirm` — ask before doing it. For anything a missed toast cannot undo.
 * - `undo` — do it, and hand back a one-tap reversal.
 * - `none` — legal ONLY for actions that write nothing (navigation).
 *
 * A swipe is easy to fire by accident while scrolling a market stall one-handed.
 * Nothing that touches stored data or a public listing may go unguarded.
 */
export type SwipeGuard = "confirm" | "undo" | "none";

export type ItemActionKey = "markSold" | "undoSold" | "publish" | "unpublish";
export type BatchActionKey = "addItem" | "deleteBatch";

export type SwipeAction<K extends string> = {
  key: K;
  label: string;
  icon: IconName;
  side: SwipeSide;
  tone: SwipeTone;
  guard: SwipeGuard;
};

export type ItemSwipeAction = SwipeAction<ItemActionKey>;
export type BatchSwipeAction = SwipeAction<BatchActionKey>;

/**
 * Structural minimum an item must supply — deliberately not the drizzle row, so
 * this stays testable without a database.
 */
export type SwipeItem = {
  status: "available" | "sold";
  publishedAt: Date | null;
};

/** Can this seller put something up for sale right now? */
export type ShopAccess = {
  pro: boolean;
  /** A shop profile exists (cached or freshly read). Publishing needs one. */
  hasShop: boolean;
};

/**
 * Width of one action panel. Comfortably past the 44pt minimum target so the
 * icon and its label both land inside the tap area even when the panel is
 * pressed rather than swiped through.
 */
export const SWIPE_ACTION_WIDTH = 92;

/**
 * The actions an inventory row offers.
 *
 * Left is always the sold toggle — the thing you actually do on a market floor,
 * so it gets the dominant direction and the acid. Right is the storefront.
 */
export function itemSwipeActions(item: SwipeItem, shop: ShopAccess): ItemSwipeAction[] {
  const actions: ItemSwipeAction[] = [];

  if (item.status === "sold") {
    // NOT undo-guarded: un-marking clears the sold price and the date it sold
    // on, and re-marking it can only stamp today — an "undo" that quietly moves
    // a sale to the wrong day would corrupt every figure derived from it.
    actions.push({ key: "undoSold", label: "Undo sold", icon: "ArrowsClockwise", side: "left", tone: "primary", guard: "confirm" });
  } else {
    actions.push({ key: "markSold", label: "Mark sold", icon: "Check", side: "left", tone: "primary", guard: "undo" });
  }

  if (item.publishedAt != null) {
    // Publishing needs a shop to publish INTO; taking something down only ever
    // needs the item itself. A seller whose Pro lapsed, or who is offline before
    // the shop profile has been cached, must never be trapped with stock live on
    // a page they can no longer control. Same rule the item-detail toggle ships.
    actions.push({ key: "unpublish", label: "Unpublish", icon: "Storefront", side: "right", tone: "danger", guard: "confirm" });
  } else if (shop.pro && shop.hasShop) {
    actions.push({ key: "publish", label: "Publish", icon: "Storefront", side: "right", tone: "primary", guard: "undo" });
  }

  return actions;
}

/**
 * The actions a batch card offers. There is nothing per-batch to decide yet —
 * the signature stays a function so callers keep asking this module rather than
 * inlining a literal the day archiving arrives.
 *
 * Delete is the only destructive verb a batch has today (there is no archived
 * column to flip), and it takes every item and photo in the batch with it, so
 * it is confirm-guarded and never undo-guarded.
 */
export function batchSwipeActions(): BatchSwipeAction[] {
  return [
    { key: "addItem", label: "Add item", icon: "Plus", side: "left", tone: "primary", guard: "none" },
    { key: "deleteBatch", label: "Delete", icon: "Trash", side: "right", tone: "danger", guard: "confirm" },
  ];
}
