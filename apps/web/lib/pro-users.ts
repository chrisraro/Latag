import { isEntitlingSku } from "@latag/licensing";

/** The subset of a `licenses` row this module needs. */
export type ProLicenseRow = {
  user_id: string;
  sku: string;
  status: string;
};

/** Statuses that still unlock Pro. `past_due` is a grace period, not a lockout. */
const UNLOCKING_STATUSES = new Set(["active", "past_due"]);

/**
 * The set of users who currently have Pro, from every license row in the table.
 *
 * Scoped to entitling SKUs rather than purchasable ones so comped and
 * grandfathered users are reported accurately — an admin who sees "Free" next
 * to a comped account will re-grant it or assume the grant failed.
 */
export function activeProUserIds(licenses: ProLicenseRow[]): Set<string> {
  const ids = new Set<string>();
  for (const license of licenses) {
    if (isEntitlingSku(license.sku) && UNLOCKING_STATUSES.has(license.status)) {
      ids.add(license.user_id);
    }
  }
  return ids;
}
