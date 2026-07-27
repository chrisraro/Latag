/**
 * Route for the toolbar FAB's quick-add tap.
 *
 * G2 (true batch-less items) has not landed yet, so quick-add opens the
 * composer scoped to the most recently created batch instead of a bare
 * composer. `mostRecentBatchId` is expected to come from a sessions query
 * ordered by `createdAt` descending, limit 1 — any session type counts,
 * scheduled or live, since a batch exists the moment its record is created.
 */
export function quickAddRoute(mostRecentBatchId: string | null): string {
  // G2 replaces this line: once solo items ship, quick-add opens the
  // composer directly with no batch selected instead of picking one for you.
  return mostRecentBatchId ? `/session/${mostRecentBatchId}/add` : "/session/new";
}
