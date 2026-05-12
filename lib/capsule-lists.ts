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
import { loadPublicOnchainCapsules } from "@/lib/public-onchain-capsules";
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

/** Full gallery pool: public on-chain capsules + local mints + demo gallery list. */
export async function buildGalleryPool(): Promise<CapsuleItem[]> {
  const onchain = await loadPublicOnchainCapsules();
  const minted = loadMintedCapsules().map(storedToCapsuleItem);
  return dedupeById(onchain, dedupeById(minted, galleryCapsules));
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
 * Home hero row: public on-chain opened capsules + local mints + demo seeds,
 * all keyed to `chainNowSec` so “Opened X ago” matches the chain clock.
 * Newest unlock time first; capped at `limit` (default 3).
 */
export async function buildHomeRecentlyOpenedCapsules(
  chainNowSec: number,
  limit = 3,
): Promise<CapsuleItem[]> {
  const now = Math.floor(chainNowSec);
  if (now <= 0) return [];

  const onchainOpened = (await loadPublicOnchainCapsules()).filter((c) => {
    const u = c.unlockAtUnix;
    return u != null && isPlausibleOpened(u, now);
  });

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
  for (const c of onchainOpened) {
    byId.set(c.id, c);
  }

  const combined = [...byId.values()].sort(
    (a, b) => (b.unlockAtUnix ?? 0) - (a.unlockAtUnix ?? 0),
  );

  return combined.slice(0, limit);
}
