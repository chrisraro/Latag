import { NextResponse, type NextRequest } from "next/server";
import { manualProvider } from "@/lib/payments/manual";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/payments — provider-agnostic seam. The handler only
 * ever talks to the `PaymentProvider` interface (`verifyWebhook`), never a
 * concrete provider's SDK; swapping `manualProvider` for a real adapter
 * later changes no code in this file. Today's manual provider always
 * rejects, so this always answers 501 — purchases are not open yet.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const verdict = await manualProvider.verifyWebhook(raw, request.headers.get("x-signature"));

  if (!verdict.ok) {
    return NextResponse.json({ error: "purchases-open-soon" }, { status: 501 });
  }

  // Unreachable while manualProvider is the active provider — kept so a
  // future provider swap only needs to fill this branch in, not restructure
  // the handler.
  return NextResponse.json({ ok: true });
}
