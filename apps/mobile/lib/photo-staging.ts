export type SlotType = "front" | "back" | "tag" | "flaw";
let staged: Partial<Record<SlotType, string>> = {};
export function stagePhoto(slot: SlotType, uri: string) { staged[slot] = uri; }
export function peekStagedPhotos() { return { ...staged }; }
export function takeStagedPhotos() { const s = { ...staged }; staged = {}; return s; }
