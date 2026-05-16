import type { CapsuleItem } from "@/lib/capsule-types";

/** Ignore sentinel / corrupt unlock values (e.g. legacy `1` used as opened flag). */
export const MIN_RELIABLE_UNLOCK_UNIX = 1_000_000_000;

export function isReliableUnlockTimestamp(
  value: number | undefined,
): value is number {
  return (
    value != null &&
    Number.isFinite(value) &&
    value >= MIN_RELIABLE_UNLOCK_UNIX
  );
}

export function parseOnchainTokenId(id: string): string | null {
  const trimmed = id.trim();
  const match = /^onchain-(\d+)$/.exec(trimmed);
  return match?.[1] ?? null;
}

/** Strip legacy sentinel unlock values from cached / probed items. */
export function sanitizeCapsuleUnlockFields(item: CapsuleItem): CapsuleItem {
  if (isReliableUnlockTimestamp(item.unlockAtUnix)) return item;

  if (item.openedOnChain === true) {
    return { ...item, unlockAtUnix: undefined };
  }

  if (item.unlockAtUnix != null && item.unlockAtUnix < MIN_RELIABLE_UNLOCK_UNIX) {
    return {
      ...item,
      unlockAtUnix: undefined,
      openedOnChain: item.openedOnChain ?? true,
    };
  }

  return item;
}
