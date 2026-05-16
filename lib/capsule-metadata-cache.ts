import { capsuleCanonKey } from "@/lib/capsule-keys";
import type { CapsuleItem } from "@/lib/capsule-types";

const STORAGE_KEY = "ritual-capsule-metadata-v1";
const CANON_PREFIX = "canon:";

type Entry = {
  message: string;
  userPhoto: string;
  tag: CapsuleItem["tag"];
};

type Persisted = {
  v: 1;
  byId: Record<string, Entry>;
};

function canonStorageKey(item: CapsuleItem): string {
  return `${CANON_PREFIX}${capsuleCanonKey(item)}`;
}

function lookupEntry(
  store: Record<string, Entry>,
  item: CapsuleItem,
): Entry | undefined {
  return store[item.id] ?? store[canonStorageKey(item)];
}

function readStore(): Record<string, Entry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed?.v !== 1 || !parsed.byId) return {};
    return parsed.byId;
  } catch {
    return {};
  }
}

function writeStore(byId: Record<string, Entry>): void {
  if (typeof window === "undefined") return;
  try {
    const payload: Persisted = { v: 1, byId };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota
  }
}

export function applyMetadataCache(items: CapsuleItem[]): CapsuleItem[] {
  const store = readStore();
  if (Object.keys(store).length === 0) return items;

  return items.map((item) => {
    const cached = lookupEntry(store, item);
    if (!cached) return item;
    return {
      ...item,
      message: item.message.trim() || cached.message,
      userPhoto: item.userPhoto.trim() || cached.userPhoto,
      tag: item.tag || cached.tag,
    };
  });
}

export function persistMetadataCache(items: CapsuleItem[]): void {
  if (typeof window === "undefined") return;
  const store = readStore();
  let changed = false;

  for (const item of items) {
    const message = item.message.trim();
    const userPhoto = item.userPhoto.trim();
    if (!message && !userPhoto) continue;

    const prev = store[item.id];
    if (
      prev?.message === message &&
      prev?.userPhoto === userPhoto &&
      prev?.tag === item.tag
    ) {
      continue;
    }

    const entry: Entry = {
      message: message || prev?.message || "",
      userPhoto: userPhoto || prev?.userPhoto || "",
      tag: item.tag || prev?.tag || "Personal",
    };
    store[item.id] = entry;
    store[canonStorageKey(item)] = entry;
    changed = true;
  }

  if (changed) writeStore(store);
}
