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

/** Unique row identity: id + owner + unlock (all normalized). */
export function capsuleCompositeKey(item: CapsuleItem): string {
  const owner = item.owner?.toLowerCase() ?? "";
  const u = normalizeOptionalUnixTime(item.unlockAtUnix);
  const unlockPart =
    u != null && Number.isFinite(u) ? String(Math.floor(u)) : "na";
  return `${item.id}|${owner}|${unlockPart}`;
}

function ownerUnlockKey(item: CapsuleItem): string {
  const owner = item.owner?.toLowerCase() ?? "";
  const u = normalizeOptionalUnixTime(item.unlockAtUnix);
  return `${owner}|${u != null && Number.isFinite(u) ? String(Math.floor(u)) : "na"}`;
}

function richnessScore(item: CapsuleItem): number {
  return item.message.trim().length + item.userPhoto.trim().length;
}

function isOnchainId(id: string): boolean {
  return /^onchain-\d+$/.test(id);
}

/**
 * One canonical list: no duplicate rows.
 *
 * 1) Same composite key `(id + owner + unlockAtUnix)` → keep the richest row
 *    (more message/photo), breaking ties toward `onchain-*` ids.
 * 2) Same `(owner + unlock)` but different ids (e.g. optimistic `0x…` tx id vs
 *    real `onchain-N`) → keep a single row, always prefer `onchain-*` when present.
 */
export function dedupeCapsules(items: CapsuleItem[]): CapsuleItem[] {
  const sorted = sortByUnlockNewestFirst([...items]);
  const byComposite = new Map<string, CapsuleItem>();

  for (const item of sorted) {
    const key = capsuleCompositeKey(item);
    const existing = byComposite.get(key);
    if (!existing) {
      byComposite.set(key, item);
      continue;
    }
    const pick =
      tieBreakDuplicate(existing, item) >= 0 ? existing : item;
    byComposite.set(key, pick);
  }

  const afterComposite = [...byComposite.values()];
  const groups = new Map<string, CapsuleItem[]>();
  for (const item of afterComposite) {
    const k = ownerUnlockKey(item);
    const g = groups.get(k) ?? [];
    g.push(item);
    groups.set(k, g);
  }

  const merged: CapsuleItem[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]!);
      continue;
    }
    const onchains = group.filter((i) => isOnchainId(i.id));
    if (onchains.length === 1) {
      merged.push(onchains[0]!);
      continue;
    }
    if (onchains.length > 1) {
      const seen = new Set<string>();
      for (const o of onchains) {
        if (!seen.has(o.id)) {
          seen.add(o.id);
          merged.push(o);
        }
      }
      continue;
    }
    const best = group.reduce((a, b) =>
      tieBreakDuplicate(a, b) >= 0 ? a : b,
    );
    merged.push(best);
  }

  return sortByUnlockNewestFirst(merged);
}

/** >= 0 means `a` wins over `b`. */
function tieBreakDuplicate(a: CapsuleItem, b: CapsuleItem): number {
  const ra = richnessScore(a);
  const rb = richnessScore(b);
  if (ra !== rb) return ra - rb;
  const aOn = isOnchainId(a.id) ? 1 : 0;
  const bOn = isOnchainId(b.id) ? 1 : 0;
  if (aOn !== bOn) return aOn - bOn;
  return a.id.localeCompare(b.id);
}

async function loadOnchainCapsulesDeduped(): Promise<CapsuleItem[]> {
  const raw = await withTimeout(
    loadPublicOnchainCapsules(),
    LOAD_TIMEOUT_MS,
    [],
  );
  return dedupeCapsules(raw);
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

  return dedupeCapsules([...onchain, ...minted]);
}

/** All on-chain capsules (deduped). Gallery filters to opened in the UI. */
export async function buildGalleryPool(): Promise<CapsuleItem[]> {
  return loadOnchainCapsulesDeduped();
}

/** Same list as gallery; Home keeps first 3 opened in the component. */
export async function buildHomeRecentlyOpenedCapsules(
  _chainNowSec: number,
  _limit = 3,
): Promise<CapsuleItem[]> {
  void _chainNowSec;
  void _limit;
  return loadOnchainCapsulesDeduped();
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
