/**
 * The batch-less console's camera. Same screen as `/session/[id]/camera` — it
 * only ever reads `slot` and `filled` and stages onto the photo bus, so the
 * batch-less route needs nothing but its own path to live at.
 */
export { default } from "../../session/[id]/camera";
