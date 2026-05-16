import { normalizeBlockTimestampToSeconds } from "@/lib/chain-time";
import type { CapsuleItem } from "@/lib/capsule-types";

function normalizeOptionalUnixTime(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return normalizeBlockTimestampToSeconds(value);
}

export function capsuleCanonKey(item: CapsuleItem): string {
  return `${item.owner?.toLowerCase() || ""}|${normalizeOptionalUnixTime(item.unlockAtUnix) ?? 0}|${item.tag}`;
}

/** Stable unique React key — prefer on-chain / tx id (never content-only). */
export function capsuleReactKey(item: CapsuleItem, index?: number): string {
  const id = item.id?.trim();
  if (id) return id;

  const parts = [
    item.owner?.toLowerCase() || "unknown-owner",
    String(normalizeOptionalUnixTime(item.unlockAtUnix) ?? 0),
    item.message.trim(),
    item.tag,
  ];
  if (index != null) parts.push(String(index));
  return parts.join("|");
}
