import {
  loadMintedCapsules,
  storedToCapsuleItem,
} from "@/lib/minted-capsules-storage";
import { loadPublicOnchainCapsules } from "@/lib/public-onchain-capsules";
import type { CapsuleItem } from "@/lib/capsule-types";

function dedupeKey(item: CapsuleItem): string {
  return [
    item.id,
    item.owner?.toLowerCase() ?? "",
    item.unlockAtUnix == null ? "" : Math.floor(item.unlockAtUnix).toString(),
    item.message.trim(),
    item.tag,
  ].join("|");
}

function canonicalCapsuleKey(item: CapsuleItem): string {
  return [
    item.owner?.toLowerCase() ?? "",
    item.unlockAtUnix == null ? "" : Math.floor(item.unlockAtUnix).toString(),
    item.message.trim(),
    item.tag,
  ].join("|");
}

function dedupeById(preferred: CapsuleItem[], rest: CapsuleItem[] = []): CapsuleItem[] {
  const result: CapsuleItem[] = [];
  const seenIds = new Set<string>();
  const seenStrict = new Set<string>();
  const seenCanonical = new Set<string>();

  for (const item of [...preferred, ...rest]) {
    const strictKey = dedupeKey(item);
    const canonicalKey = canonicalCapsuleKey(item);
    if (
      seenIds.has(item.id) ||
      seenStrict.has(strictKey) ||
      (item.owner && item.unlockAtUnix != null && seenCanonical.has(canonicalKey))
    ) {
      continue;
    }

    seenIds.add(item.id);
    seenStrict.add(strictKey);
    if (item.owner && item.unlockAtUnix != null) {
      seenCanonical.add(canonicalKey);
    }
    result.push(item);
  }

  return result;
}

function hasPublicContent(item: CapsuleItem): boolean {
  return item.message.trim().length > 0 || item.userPhoto.trim().length > 0;
}

function isOpenedAtChainTime(item: CapsuleItem, chainNowSec: number): boolean {
  const now = Math.floor(chainNowSec);
  const unlockAt = item.unlockAtUnix;
  return unlockAt != null && unlockAt <= now;
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
  const capsules = await loadPublicOnchainCapsules();
  const withPublicContent = dedupeById(capsules.filter(hasPublicContent));
  console.debug("[GalleryPool] public capsules", {
    count: capsules.length,
    withPublicContent: withPublicContent.length,
    items: withPublicContent.map((item) => ({
      id: item.id,
      unlockAtUnix: item.unlockAtUnix,
      hasPhoto: Boolean(item.userPhoto),
      messageLength: item.message.length,
    })),
  });
  return withPublicContent;
}

/** Only capsules that are open at `chainNowSec`. */
export function filterOpenedAtChainTime(
  items: CapsuleItem[],
  chainNowSec: number,
): CapsuleItem[] {
  return items.filter((item) => isOpenedAtChainTime(item, chainNowSec));
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

  const loaded = await loadPublicOnchainCapsules();
  const onchainOpened = loaded.filter((c) => {
    const u = c.unlockAtUnix;
    return u != null && isPlausibleOpened(u, now) && hasPublicContent(c);
  });

  const combined = dedupeById(onchainOpened).sort(
    (a, b) => (b.unlockAtUnix ?? 0) - (a.unlockAtUnix ?? 0),
  );

  console.debug("[HomeRecentlyOpenedBuilder] opened capsules", {
    now,
    loaded: loaded.length,
    withPublicContent: loaded.filter(hasPublicContent).length,
    count: combined.length,
    items: combined.map((item) => ({
      id: item.id,
      unlockAtUnix: item.unlockAtUnix,
      hasPhoto: Boolean(item.userPhoto),
      messageLength: item.message.length,
    })),
  });

  return combined.slice(0, limit);
}
