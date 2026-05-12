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
export async function buildGalleryPool(): Promise<CapsuleItem[]> {
  return loadPublicOnchainCapsules();
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
 * Home hero row: real public on-chain opened capsules only.
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
    return (
      u != null &&
      isPlausibleOpened(u, now) &&
      c.userPhoto.trim().length > 0 &&
      c.message.trim().length > 0
    );
  });

  const combined = onchainOpened.sort(
    (a, b) => (b.unlockAtUnix ?? 0) - (a.unlockAtUnix ?? 0),
  );

  return combined.slice(0, limit);
}
