import type { CapsuleTag } from "./capsule-categories";
import type { CapsuleItem } from "./capsule-types";

export type StoredMintedCapsule = {
  id: string;
  owner: string;
  unlockAtUnix: number;
  message: string;
  tag: CapsuleTag;
  /** Data URL or https URL; empty if no photo was kept. */
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
  const deduped = all.filter((item) => {
    const key = canonicalMintKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (deduped.length !== all.length) {
    writeAll(deduped);
  }
  return deduped;
}

export function appendMintedCapsule(item: StoredMintedCapsule): void {
  const all = readRaw();
  const itemKey = canonicalMintKey(item);
  const rest = all.filter(
    (x) => x.id !== item.id && canonicalMintKey(x) !== itemKey,
  );
  writeAll([item, ...rest]);
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

export async function blobUrlToPersistedPhoto(
  photoUrl: string | null,
): Promise<string> {
  if (!photoUrl) return "";
  if (photoUrl.startsWith("data:")) return photoUrl;
  if (!photoUrl.startsWith("blob:")) return photoUrl;
  try {
    const blob = await fetch(photoUrl).then((r) => r.blob());
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}
