import type { CapsuleTag } from "./capsule-categories";
import type { CapsuleItem } from "./capsule-types";

export type StoredMintedCapsule = {
  id: string;
  owner: string;
  unlockAtUnix: number;
  message: string;
  tag: CapsuleTag;
  /** Never persist user photos locally; public photos are read from on-chain metadata. */
  userPhoto: string;
};

const STORAGE_KEY = "ritual-minted-capsules-v1";

type Persisted = { v: 1; items: StoredMintedCapsule[] };

function canonicalMintKey(item: Pick<StoredMintedCapsule, "owner" | "unlockAtUnix" | "message" | "tag">): string {
  return [
    item.owner.toLowerCase(),
    Math.floor(item.unlockAtUnix),
    item.message.trim(),
    item.tag,
  ].join("|");
}

function readRaw(): StoredMintedCapsule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed?.v !== 1 || !Array.isArray(parsed.items)) return [];
    return parsed.items;
  } catch {
    return [];
  }
}

function writeAll(items: StoredMintedCapsule[]) {
  if (typeof window === "undefined") return;
  const payload: Persisted = { v: 1, items };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadMintedCapsules(): StoredMintedCapsule[] {
  const all = readRaw();
  const seen = new Set<string>();
  const sanitized = all.map((item) => ({ ...item, userPhoto: "" }));
  const deduped = sanitized.filter((item) => {
    const key = canonicalMintKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (
    deduped.length !== all.length ||
    all.some((item) => item.userPhoto.trim().length > 0)
  ) {
    writeAll(deduped);
  }
  return deduped;
}

export function appendMintedCapsule(item: StoredMintedCapsule): void {
  const all = readRaw();
  const sanitized = { ...item, userPhoto: "" };
  const itemKey = canonicalMintKey(sanitized);
  const rest = all.filter(
    (x) => x.id !== item.id && canonicalMintKey(x) !== itemKey,
  );
  writeAll([sanitized, ...rest.map((x) => ({ ...x, userPhoto: "" }))]);
}

export function storedToCapsuleItem(s: StoredMintedCapsule): CapsuleItem {
  return {
    id: s.id,
    owner: s.owner,
    userPhoto: s.userPhoto,
    message: s.message,
    tag: s.tag,
    unlockAtUnix: s.unlockAtUnix,
  };
}
