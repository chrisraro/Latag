/**
 * Where the tab bar's quick-add button goes.
 *
 * Since G2 an item no longer needs a batch (`items.sessionId` is nullable), so
 * quick-add opens the Rapid Console with no batch attached instead of picking
 * one for you. Both bars — the native toolbar's FAB and `FloatingTabBar`'s —
 * share this constant so there is exactly one quick-add destination.
 */
export const QUICK_ADD_ROUTE = "/item/new";
