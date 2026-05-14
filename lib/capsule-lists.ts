import {
  loadMintedCapsules,
  storedToCapsuleItem,
} from "@/lib/minted-capsules-storage";
import { loadPublicOnchainCapsules } from "@/lib/public-onchain-capsules";
import { normalizeBlockTimestampToSeconds } from "@/lib/chain-time";
import type { CapsuleItem } from "@/lib/capsule-types";

const LOAD_TIMEOUT_MS = 12_000;

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
        console.warn("[CapsuleLists] load timeout or error", error);
        resolve(fallback);
      },
    );
  });
}

function sortByUnlockNewestFirst(items: CapsuleItem[]): CapsuleItem[] {
  return [...items].sort(
    (a, b) =>
      (normalizeOptionalUnixTime(b.unlockAtUnix) ?? 0) -
      (normalizeOptionalUnixTime(a.unlockAtUnix) ?? 0),
  );
}

/** Same composite key as inside `dedupeCapsules` (React list keys). */
export function capsuleDedupeKey(item: CapsuleItem): string {
  return `${item.owner?.toLowerCase() || ""}|${item.unlockAtUnix || 0}|${item.message.trim()}|${item.tag}`;
}

export function dedupeCapsules(items: CapsuleItem[]): CapsuleItem[] {
  const seen = new Map<string, CapsuleItem>();
  for (const item of items) {
    const key = capsuleDedupeKey(item);
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values());
}

async function fetchOnchainCapsulesRaw(): Promise<CapsuleItem[]> {
  return withTimeout(loadPublicOnchainCapsules(), LOAD_TIMEOUT_MS, []);
}

function isOpenedAtChainTime(item: CapsuleItem, chainNowSec: number): boolean {
  const now = normalizeBlockTimestampToSeconds(chainNowSec);
  const unlockAt = normalizeOptionalUnixTime(item.unlockAtUnix);
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

  return sortByUnlockNewestFirst(dedupeCapsules([...onchain, ...minted]));
}

/** All on-chain capsules (deduped). Gallery filters to opened in the UI. */
export async function buildGalleryPool(): Promise<CapsuleItem[]> {
  const raw = await fetchOnchainCapsulesRaw();
  return sortByUnlockNewestFirst(dedupeCapsules(raw));
}

/** Same source as gallery; Home takes first 3 opened in the component. */
export async function buildHomeRecentlyOpenedCapsules(
  _chainNowSec: number,
  _limit = 3,
): Promise<CapsuleItem[]> {
  void _chainNowSec;
  void _limit;
  const raw = await fetchOnchainCapsulesRaw();
  return sortByUnlockNewestFirst(dedupeCapsules(raw));
}

/** Capsules whose unlock time has passed (requires `unlockAtUnix`). */
export function filterOpenedAtChainTime(
  items: CapsuleItem[],
  chainNowSec: number,
): CapsuleItem[] {
  const now = normalizeBlockTimestampToSeconds(chainNowSec);
  return sortByUnlockNewestFirst(
    items.filter((item) => isOpenedAtChainTime(item, now)),
  );
}
