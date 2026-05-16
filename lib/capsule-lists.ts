import { capsuleCanonKey } from "@/lib/capsule-keys";
import {
  getCachedPublicOnchainCapsules,
  loadPublicOnchainCapsules,
  scheduleHydrateCapsules,
} from "@/lib/public-onchain-capsules";
import { normalizeBlockTimestampToSeconds } from "@/lib/chain-time";
import type { CapsuleItem } from "@/lib/capsule-types";

export { capsuleCanonKey, capsuleReactKey } from "@/lib/capsule-keys";

export const HOME_RECENTLY_OPENED_COUNT = 6;

function normalizeOptionalUnixTime(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return normalizeBlockTimestampToSeconds(value);
}

function sortByUnlockNewestFirst(items: CapsuleItem[]): CapsuleItem[] {
  return [...items].sort(
    (a, b) =>
      (normalizeOptionalUnixTime(b.unlockAtUnix) ?? 0) -
      (normalizeOptionalUnixTime(a.unlockAtUnix) ?? 0),
  );
}

function richnessScore(item: CapsuleItem): number {
  return (
    (item.message.trim() ? 4 : 0) +
    (item.userPhoto.trim() ? 4 : 0) +
    (item.id.startsWith("onchain-") ? 1 : 0)
  );
}

export function capsuleDedupeKey(item: CapsuleItem): string {
  return `${item.owner?.toLowerCase() || ""}|${item.unlockAtUnix || 0}|${item.message.trim()}|${item.tag}`;
}

export function dedupeCapsules(items: CapsuleItem[]): CapsuleItem[] {
  const byKey = new Map<string, CapsuleItem>();
  for (const item of items) {
    const key = capsuleDedupeKey(item);
    const existing = byKey.get(key);
    if (!existing || richnessScore(item) > richnessScore(existing)) {
      byKey.set(key, item);
    }
  }

  const byId = new Map<string, CapsuleItem>();
  for (const item of byKey.values()) {
    const existing = byId.get(item.id);
    if (!existing || richnessScore(item) > richnessScore(existing)) {
      byId.set(item.id, item);
    }
  }

  return Array.from(byId.values());
}

export function dedupeByCanon(items: CapsuleItem[]): CapsuleItem[] {
  const byCanon = new Map<string, CapsuleItem>();
  for (const item of items) {
    const key = capsuleCanonKey(item);
    const existing = byCanon.get(key);
    if (!existing) {
      byCanon.set(key, item);
      continue;
    }
    const preferId = item.id.startsWith("onchain-")
      ? item.id
      : existing.id.startsWith("onchain-")
        ? existing.id
        : item.id;
    byCanon.set(key, {
      ...existing,
      ...item,
      id: preferId,
      message: item.message.trim() || existing.message,
      userPhoto: item.userPhoto.trim() || existing.userPhoto,
      unlockAtUnix: item.unlockAtUnix ?? existing.unlockAtUnix,
      owner: item.owner ?? existing.owner,
      tag: item.tag || existing.tag,
    });
  }
  return Array.from(byCanon.values());
}

/** Gallery: one card per on-chain token id (never merge different tokenIds). */
export function dedupeForPublicGallery(items: CapsuleItem[]): CapsuleItem[] {
  const byId = new Map<string, CapsuleItem>();
  for (const item of items) {
    const existing = byId.get(item.id);
    if (!existing || richnessScore(item) > richnessScore(existing)) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values());
}

export function isOpenedAtChainTime(
  item: CapsuleItem,
  chainNowSec: number,
): boolean {
  if (item.openedOnChain === true) return true;
  if (item.openedOnChain === false) return false;
  const now =
    Number.isFinite(chainNowSec) && chainNowSec > 0
      ? normalizeBlockTimestampToSeconds(chainNowSec)
      : Math.floor(Date.now() / 1000);
  const unlockAt = normalizeOptionalUnixTime(item.unlockAtUnix);
  return unlockAt != null && unlockAt <= now;
}

export function needsMetadataHydration(item: CapsuleItem): boolean {
  return !item.message.trim() || !item.userPhoto.trim();
}

/** Opened capsules from Ritual Testnet cache only (sync). */
export function enrichOpenedForDisplay(
  onchain: CapsuleItem[],
  chainNowSec: number,
): CapsuleItem[] {
  return filterOpenedAtChainTime(
    sortByUnlockNewestFirst(dedupeForPublicGallery(onchain)),
    chainNowSec,
  );
}

function kickBackgroundOnchainRefresh(chainNowSec: number): void {
  void loadPublicOnchainCapsules({ chainNowSec });
}

/** Wallet capsules from on-chain cache (sync). */
export function buildMyCapsulesFromCache(
  walletAddress: string | undefined,
  chainNowSec: number,
): CapsuleItem[] {
  const owner = walletAddress?.toLowerCase();
  if (!owner) return [];
  return sortByUnlockNewestFirst(
    dedupeByCanon(
      getCachedPublicOnchainCapsules().filter(
        (item) => item.owner?.toLowerCase() === owner,
      ),
    ),
  );
}

export async function buildMyCapsulesList(
  walletAddress: string | undefined,
  chainNowSec = Math.floor(Date.now() / 1000),
): Promise<CapsuleItem[]> {
  const owner = walletAddress?.toLowerCase();
  if (!owner) return [];

  const instant = buildMyCapsulesFromCache(owner, chainNowSec);
  kickBackgroundOnchainRefresh(chainNowSec);

  const opened = instant.filter((item) =>
    isOpenedAtChainTime(item, chainNowSec),
  );
  scheduleHydrateCapsules(opened, chainNowSec);

  if (instant.length > 0) return instant;

  const fresh = (await loadPublicOnchainCapsules({ chainNowSec })).filter(
    (item) => item.owner?.toLowerCase() === owner,
  );
  const merged = sortByUnlockNewestFirst(dedupeByCanon(fresh));
  scheduleHydrateCapsules(
    merged.filter((item) => isOpenedAtChainTime(item, chainNowSec)),
    chainNowSec,
  );
  return merged;
}

export function buildGalleryPoolFromCache(
  chainNowSec = Math.floor(Date.now() / 1000),
): CapsuleItem[] {
  return enrichOpenedForDisplay(getCachedPublicOnchainCapsules(), chainNowSec);
}

export async function buildGalleryPool(
  chainNowSec = Math.floor(Date.now() / 1000),
): Promise<CapsuleItem[]> {
  const instant = buildGalleryPoolFromCache(chainNowSec);
  kickBackgroundOnchainRefresh(chainNowSec);

  if (instant.length > 0) {
    scheduleHydrateCapsules(
      instant.filter(needsMetadataHydration),
      chainNowSec,
    );
    return instant;
  }

  const raw = await loadPublicOnchainCapsules({ chainNowSec });
  const opened = enrichOpenedForDisplay(raw, chainNowSec);
  scheduleHydrateCapsules(
    opened.filter(needsMetadataHydration),
    chainNowSec,
  );
  return opened;
}

export function buildHomeRecentlyOpenedFromCache(
  chainNowSec: number,
  limit = HOME_RECENTLY_OPENED_COUNT,
): CapsuleItem[] {
  return buildGalleryPoolFromCache(chainNowSec).slice(0, limit);
}

export async function buildHomeRecentlyOpenedCapsules(
  chainNowSec: number,
  limit = HOME_RECENTLY_OPENED_COUNT,
): Promise<CapsuleItem[]> {
  const instant = buildHomeRecentlyOpenedFromCache(chainNowSec, limit);
  kickBackgroundOnchainRefresh(chainNowSec);

  if (instant.length > 0) {
    scheduleHydrateCapsules(
      instant.filter(needsMetadataHydration),
      chainNowSec,
    );
    return instant;
  }

  return (await buildGalleryPool(chainNowSec)).slice(0, limit);
}

export function filterOpenedAtChainTime(
  items: CapsuleItem[],
  chainNowSec: number,
): CapsuleItem[] {
  return sortByUnlockNewestFirst(
    items.filter((item) => isOpenedAtChainTime(item, chainNowSec)),
  );
}
