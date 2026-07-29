"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui";
import { GrantRevokeForm } from "./GrantRevokeForm";

type User = {
  id: string;
  email?: string;
  created_at: string;
};

type Props = {
  users: User[];
  activeProUserIds: Set<string>;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Users table with client-side search.
 *
 * Search filters by email (case-insensitive). Since we cap at 50 users,
 * client-side filtering is fine — no need for server-side pagination.
 */
export function UsersTable({ users, activeProUserIds }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.email?.toLowerCase().includes(q) ?? false);
  }, [users, query]);

  return (
    <div>
      {/* Search input */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email..."
            className="w-full rounded-xl border border-hairline bg-surface1 px-4 py-2.5 text-sm text-ink placeholder:text-inkfaint focus:border-acid/50 focus:outline-none focus:ring-1 focus:ring-acid/30"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-inkfaint hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>
        <span className="whitespace-nowrap text-xs text-inkfaint">
          {filtered.length} of {users.length}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-hairline bg-surface1">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs uppercase tracking-wide text-inkfaint">
              <th className="px-5 py-4 font-normal">Email</th>
              <th className="px-5 py-4 font-normal">Created</th>
              <th className="px-5 py-4 font-normal">License</th>
              <th className="px-5 py-4 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const isPro = activeProUserIds.has(u.id);
              return (
                <tr key={u.id} className="border-b border-hairline last:border-0">
                  <td className="px-5 py-4 text-ink">{u.email ?? "—"}</td>
                  <td className="tnum px-5 py-4 text-inkdim">{formatDate(u.created_at)}</td>
                  <td className="px-5 py-4">
                    {isPro ? <Badge>PRO</Badge> : <span className="text-inkfaint">Free</span>}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <GrantRevokeForm userId={u.id} isPro={isPro} />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-inkfaint">
                  {query ? "No users match your search." : "No users yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
