import { supabase } from "./supabase";
import { db } from "../db/client";
import { fetchLicense, applyLicense, clearLicense } from "./license";
import { showSuccess } from "./toast";

type BackableRouter = { back: () => void };

/**
 * Shared post-auth step: reads the freshly-established Supabase session,
 * checks license status against the backend, and caches the result locally.
 * Called after both sign-in paths (OTP code verify, deep-link code exchange)
 * so the behavior — and the toast copy — stays identical either way.
 *
 * Never throws: any failure (no session, network error) is swallowed so a
 * flaky/offline connection can never crash the app. Returns whether a
 * session was actually found (i.e. sign-in succeeded), so callers can
 * decide whether to react (e.g. dismiss a modal).
 */
export async function completeSignIn(router?: BackableRouter): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return false;

    const res = await fetchLicense(session.access_token);
    if (res.kind === "pro") {
      applyLicense(db, { receipt: res.receipt });
      showSuccess("Pro activated — yours forever, even offline");
    } else if (res.kind === "none") {
      clearLicense(db);
      showSuccess("Signed in — no Pro license on this account yet");
    } else {
      showSuccess("Signed in — couldn't check license (offline?), will retry next time");
    }

    router?.back();
    return true;
  } catch {
    return false;
  }
}
