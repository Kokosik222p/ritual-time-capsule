import { capsuleCanonKey } from "@/lib/capsule-keys";
import {
  isReliableUnlockTimestamp,
  parseOnchainTokenId,
} from "@/lib/capsule-unlock";
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

function unlockSortKey(item: CapsuleItem): number {
  const unlock = normalizeOptionalUnixTime(item.unlockAtUnix);
  if (isReliableUnlockTimestamp(unlock)) return unlock;
  const token = parseOnchainTokenId(item.id);
  if (token != null) return Number(token);
  return 0;
}

function sortByUnlockNewestFirst(items: CapsuleItem[]): CapsuleItem[] {
  return [...items].sort((a, b) => unlockSortKey(b) - unlockSortKey(a));
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

function preferRicherCapsule(a: CapsuleItem, b: CapsuleItem): CapsuleItem {
  if (richnessScore(b) > richnessScore(a)) return b;
  if (richnessScore(a) > richnessScore(b)) return a;
  if (a.id.startsWith("onchain-") && !b.id.startsWith("onchain-")) return a;
  if (b.id.startsWith("onchain-") && !a.id.startsWith("onchain-")) return b;
  return a;
}

/**
 * Gallery: one card per NFT (onchain token id). Drops tx-hash rows that duplicate
 * an existing onchain-N entry with the same owner/unlock/tag.
 */
export function dedupeForPublicGallery(items: CapsuleItem[]): CapsuleItem[] {
  const byOnchainToken = new Map<string, CapsuleItem>();
  const offchain: CapsuleItem[] = [];

  for (const item of items) {
    const tokenId = parseOnchainTokenId(item.id);
    if (tokenId != null) {
      const existing = byOnchainToken.get(tokenId);
      byOnchainToken.set(
        tokenId,
        existing ? preferRicherCapsule(existing, item) : item,
      );
      continue;
    }
    offchain.push(item);
  }

  const onchainCanons = new Set(
    [...byOnchainToken.values()].map((item) => capsuleCanonKey(item)),
  );
  const byOffchainId = new Map<string, CapsuleItem>();

  for (const item of offchain) {
    if (onchainCanons.has(capsuleCanonKey(item))) continue;
    const existing = byOffchainId.get(item.id);
    byOffchainId.set(
      item.id,
      existing ? preferRicherCapsule(existing, item) : item,
    );
  }

  return [...byOnchainToken.values(), ...byOffchainId.values()];
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
  if (!isReliableUnlockTimestamp(unlockAt)) return false;
  return unlockAt <= now;
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

/** Sync gallery list: opened + deduped (safe to call every cache update). */
export function buildGalleryDisplayItems(
  chainNowSec = Math.floor(Date.now() / 1000),
): CapsuleItem[] {
  return buildGalleryPoolFromCache(chainNowSec);
}

export async function buildGalleryPool(
  chainNowSec = Math.floor(Date.now() / 1000),
): Promise<CapsuleItem[]> {
  kickBackgroundOnchainRefresh(chainNowSec);

  const instant = buildGalleryDisplayItems(chainNowSec);
  if (instant.length > 0) {
    scheduleHydrateCapsules(
      instant.filter(needsMetadataHydration),
      chainNowSec,
    );
  }

  const raw = await loadPublicOnchainCapsules({ chainNowSec });
  const opened = enrichOpenedForDisplay(raw, chainNowSec);
  scheduleHydrateCapsules(
    opened.filter(needsMetadataHydration),
    chainNowSec,
  );
  return opened.length > 0 ? opened : instant;
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
