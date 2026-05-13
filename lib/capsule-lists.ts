import {
  loadMintedCapsules,
  storedToCapsuleItem,
} from "@/lib/minted-capsules-storage";
import { loadPublicOnchainCapsules } from "@/lib/public-onchain-capsules";
import { normalizeBlockTimestampToSeconds } from "@/lib/chain-time";
import type { CapsuleItem } from "@/lib/capsule-types";

const HOME_LOAD_TIMEOUT_MS = 4_500;
let lastHomeRecentlyOpened: CapsuleItem[] = [];

function normalizeOptionalUnixTime(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return normalizeBlockTimestampToSeconds(value);
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = globalThis.setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timer);
        console.warn("[CapsuleLists] timed load failed", error);
        resolve(fallback);
      },
    );
  });
}

function dedupeKey(item: CapsuleItem): string {
  return [
    item.id,
    item.owner?.toLowerCase() ?? "",
    normalizeOptionalUnixTime(item.unlockAtUnix)?.toString() ?? "",
    item.message.trim(),
    item.tag,
  ].join("|");
}

function canonicalCapsuleKey(item: CapsuleItem): string {
  return [
    item.owner?.toLowerCase() ?? "",
    normalizeOptionalUnixTime(item.unlockAtUnix)?.toString() ?? "",
    item.message.trim(),
    item.tag,
  ].join("|");
}

function itemScore(item: CapsuleItem): number {
  return (
    (item.id.startsWith("onchain-") ? 8 : 0) +
    (item.userPhoto.trim().length > 0 ? 4 : 0) +
    (item.message.trim().length > 0 ? 2 : 0) +
    (item.owner ? 1 : 0)
  );
}

function dedupeById(preferred: CapsuleItem[], rest: CapsuleItem[] = []): CapsuleItem[] {
  const slots = new Map<string, CapsuleItem>();
  const order: string[] = [];

  for (const item of [...preferred, ...rest]) {
    const keys = [
      `id:${item.id}`,
      `strict:${dedupeKey(item)}`,
      item.owner && item.unlockAtUnix != null
        ? `canonical:${canonicalCapsuleKey(item)}`
        : "",
    ].filter(Boolean);
    const existingKey = keys.find((key) => slots.has(key));

    if (!existingKey) {
      const primaryKey = keys[0];
      slots.set(primaryKey, item);
      for (const key of keys.slice(1)) {
        slots.set(key, item);
      }
      order.push(primaryKey);
      continue;
    }

    const existing = slots.get(existingKey);
    if (!existing || itemScore(item) <= itemScore(existing)) continue;

    for (const [key, value] of slots.entries()) {
      if (value === existing) {
        slots.set(key, item);
      }
    }
    for (const key of keys) {
      slots.set(key, item);
    }
  }

  const seen = new Set<CapsuleItem>();
  return order
    .map((key) => slots.get(key))
    .filter((item): item is CapsuleItem => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function hasPublicContent(item: CapsuleItem): boolean {
  return item.message.trim().length > 0 || item.userPhoto.trim().length > 0;
}

function isOpenedAtChainTime(item: CapsuleItem, chainNowSec: number): boolean {
  const now = normalizeBlockTimestampToSeconds(chainNowSec);
  const unlockAt = normalizeOptionalUnixTime(item.unlockAtUnix);
  return unlockAt != null && unlockAt <= now;
}

function describeOpenFilter(item: CapsuleItem, chainNowSec: number) {
  const now = normalizeBlockTimestampToSeconds(chainNowSec);
  const unlockAt = normalizeOptionalUnixTime(item.unlockAtUnix);
  const hasContent = hasPublicContent(item);
  return {
    id: item.id,
    owner: item.owner,
    unlockAtUnix: unlockAt,
    now,
    isOpened: unlockAt != null && unlockAt <= now,
    hasContent,
    hasPhoto: Boolean(item.userPhoto),
    messageLength: item.message.length,
    reason:
      unlockAt == null
        ? "missing-unlock"
        : unlockAt > now
          ? "future-unlock"
          : !hasContent
            ? "missing-public-content"
            : "included",
  };
}

function sortNewestOpenedFirst(items: CapsuleItem[]): CapsuleItem[] {
  return [...items].sort(
    (a, b) =>
      (normalizeOptionalUnixTime(b.unlockAtUnix) ?? 0) -
      (normalizeOptionalUnixTime(a.unlockAtUnix) ?? 0),
  );
}

/** My Capsules: only capsules owned by the connected wallet. */
export async function buildMyCapsulesList(
  walletAddress: string | undefined,
): Promise<CapsuleItem[]> {
  const owner = walletAddress?.toLowerCase();
  if (!owner) return [];

  const onchain = (await loadPublicOnchainCapsules()).filter(
    (item) => item.owner?.toLowerCase() === owner,
  );
  const minted = loadMintedCapsules()
    .filter((m) => m.owner === owner)
    .map(storedToCapsuleItem);

  return dedupeById(onchain, minted);
}

/** Full gallery pool: public on-chain capsules only. */
export async function buildGalleryPool(chainNowSec?: number): Promise<CapsuleItem[]> {
  const capsules = await loadPublicOnchainCapsules();
  const withPublicContent = dedupeById(capsules.filter(hasPublicContent));
  const opened =
    chainNowSec != null && Math.floor(chainNowSec) > 0
      ? filterOpenedAtChainTime(withPublicContent, chainNowSec)
      : sortNewestOpenedFirst(withPublicContent);
  console.debug("[GalleryPool] public capsules", {
    count: capsules.length,
    withPublicContent: withPublicContent.length,
    opened: opened.length,
    chainNowSec: chainNowSec ?? null,
    filter: capsules.map((item) =>
      describeOpenFilter(item, chainNowSec ?? Number.POSITIVE_INFINITY),
    ),
    items: opened.map((item) => ({
      id: item.id,
      unlockAtUnix: item.unlockAtUnix,
      hasPhoto: Boolean(item.userPhoto),
      messageLength: item.message.length,
    })),
  });
  return opened;
}

/** Only capsules that are open at `chainNowSec`. */
export function filterOpenedAtChainTime(
  items: CapsuleItem[],
  chainNowSec: number,
): CapsuleItem[] {
  return sortNewestOpenedFirst(
    items.filter((item) => isOpenedAtChainTime(item, chainNowSec)),
  );
}

function isPlausibleOpened(u: number, now: number): boolean {
  const unlockAt = normalizeBlockTimestampToSeconds(u);
  const chainNow = normalizeBlockTimestampToSeconds(now);
  if (!Number.isFinite(unlockAt) || unlockAt > chainNow) return false;
  return true;
}

/**
 * Home hero row: real public on-chain opened capsules only.
 * Newest unlock time first; capped at `limit` (default 3).
 */
export async function buildHomeRecentlyOpenedCapsules(
  chainNowSec: number,
  limit = 3,
): Promise<CapsuleItem[]> {
  const now = normalizeBlockTimestampToSeconds(chainNowSec);
  if (now <= 0) return [];

  const loaded = await withTimeout(
    loadPublicOnchainCapsules(),
    HOME_LOAD_TIMEOUT_MS,
    lastHomeRecentlyOpened,
  );
  const filterDebug = loaded.map((item) => describeOpenFilter(item, now));
  const onchainOpened = loaded.filter((c) => {
    const u = normalizeOptionalUnixTime(c.unlockAtUnix);
    return u != null && isPlausibleOpened(u, now) && hasPublicContent(c);
  });

  const combined = sortNewestOpenedFirst(dedupeById(onchainOpened));

  console.debug("[HomeRecentlyOpenedBuilder] opened capsules", {
    now,
    loaded: loaded.length,
    withPublicContent: loaded.filter(hasPublicContent).length,
    count: combined.length,
    filter: filterDebug,
    items: combined.map((item) => ({
      id: item.id,
      unlockAtUnix: item.unlockAtUnix,
      hasPhoto: Boolean(item.userPhoto),
      messageLength: item.message.length,
    })),
  });

  const result = combined.slice(0, limit);
  if (result.length > 0) {
    lastHomeRecentlyOpened = result;
  }
  return result.length > 0 ? result : lastHomeRecentlyOpened.slice(0, limit);
}
