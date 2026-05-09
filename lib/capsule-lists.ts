import {
  galleryCapsules,
  homeRecentlyOpenedSeeds,
  mapOpenSeedsToCapsules,
  myCapsules,
} from "@/lib/demo-capsules";
import {
  loadMintedCapsules,
  storedToCapsuleItem,
} from "@/lib/minted-capsules-storage";
import type { CapsuleItem } from "@/lib/capsule-types";

function dedupeById(preferred: CapsuleItem[], rest: CapsuleItem[]): CapsuleItem[] {
  const seen = new Set(preferred.map((x) => x.id));
  return [...preferred, ...rest.filter((x) => !seen.has(x.id))];
}

/** My Capsules: user mints (this wallet) first, then demo items. */
export function buildMyCapsulesList(walletAddress: string | undefined): CapsuleItem[] {
  const owner = walletAddress?.toLowerCase();
  const minted = owner
    ? loadMintedCapsules()
        .filter((m) => m.owner === owner)
        .map(storedToCapsuleItem)
    : [];
  return dedupeById(minted, myCapsules);
}

/** Full gallery pool: minted (all owners) + demo gallery list. */
export function buildGalleryPool(): CapsuleItem[] {
  const minted = loadMintedCapsules().map(storedToCapsuleItem);
  return dedupeById(minted, galleryCapsules);
}

/** Only capsules that are open at `chainNowSec`. */
export function filterOpenedAtChainTime(
  items: CapsuleItem[],
  chainNowSec: number,
): CapsuleItem[] {
  const now = Math.floor(chainNowSec);
  return items.filter((item) => {
    const u = item.unlockAtUnix;
    if (u == null) return false;
    return u <= now;
  });
}

const MAX_HOME_AGE_SEC = 25 * 365 * 86400;

function isPlausibleOpened(u: number, now: number): boolean {
  if (!Number.isFinite(u) || u > now) return false;
  if (now - u > MAX_HOME_AGE_SEC) return false;
  return true;
}

/**
 * Home hero row: real minted capsules that are already open (localStorage) +
 * demo seeds, both keyed to `chainNowSec` so “Opened X ago” matches the chain clock.
 * Newest unlock time first; capped at `limit` (default 3).
 */
export function buildHomeRecentlyOpenedCapsules(
  chainNowSec: number,
  limit = 3,
): CapsuleItem[] {
  const now = Math.floor(chainNowSec);
  if (now <= 0) return [];

  const mintedOpened = loadMintedCapsules()
    .map(storedToCapsuleItem)
    .filter((c) => {
      const u = c.unlockAtUnix;
      return u != null && isPlausibleOpened(u, now);
    });

  const demoOpened = mapOpenSeedsToCapsules(now, homeRecentlyOpenedSeeds).filter(
    (c) => {
      const u = c.unlockAtUnix;
      return u != null && isPlausibleOpened(u, now);
    },
  );

  const byId = new Map<string, CapsuleItem>();
  for (const d of demoOpened) {
    byId.set(d.id, d);
  }
  for (const m of mintedOpened) {
    byId.set(m.id, m);
  }

  const combined = [...byId.values()].sort(
    (a, b) => (b.unlockAtUnix ?? 0) - (a.unlockAtUnix ?? 0),
  );

  return combined.slice(0, limit);
}
