import type { Address } from "viem";
import type { CapsuleTag } from "@/lib/capsule-categories";

export type CapsuleContractEnv =
  | { status: "ok"; address: Address }
  | { status: "unset" }
  | { status: "invalid"; detail: string };

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * У runtime-коді збірки `contracts/contracts/RitualTimeCapsule.sol` є `PUSH4` + селектор
 * `mintCapsule(address,uint64,string)` → байти `636a06aabb`.
 * На адресі без цього фрагмента виклик `mintCapsule` потрапляє у fallback → «execution reverted».
 */
const MINT_CAPSULE_PUSH4 = "636a06aabb";

export function bytecodeLooksLikeRitualTimeCapsuleRepo(
  bytecode: string | undefined,
): boolean {
  if (!bytecode || bytecode === "0x") return false;
  return bytecode.toLowerCase().includes(MINT_CAPSULE_PUSH4);
}

/**
 * ABI RitualTimeCapsule: mintCapsule(address to, uint64 unlockTimestamp, string tokenURI).
 * Має збігатися з `contracts/contracts/RitualTimeCapsule.sol`.
 */
export const RITUAL_CAPSULE_ABI = [
  { type: "error", name: "InvalidUnlockDate", inputs: [] },
  { type: "error", name: "CapsuleDoesNotExist", inputs: [] },
  { type: "error", name: "DailyMintLimitReached", inputs: [] },
  {
    type: "event",
    name: "CapsuleMinted",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "unlockTimestamp", type: "uint64", indexed: false },
    ],
  },
  {
    type: "function",
    name: "mintCapsule",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "unlockTimestamp", type: "uint64" },
      { name: "tokenURI", type: "string" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "DAILY_LIMIT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "dailyMints",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "lastMintDay",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

/** @deprecated Використовуйте RITUAL_CAPSULE_ABI — те саме значення. */
export const ritualTimeCapsuleAbi = RITUAL_CAPSULE_ABI;

/**
 * Читаємо лише явні `process.env.NEXT_PUBLIC_*` — інакше Next/Turbopack не інлайнить
 * значення в клієнтський бандл (динамічний `process.env[key]` лишається порожнім у браузері).
 */
function capsuleContractAddressRawFromEnv(): string {
  return (
    process.env.NEXT_PUBLIC_RITUAL_CAPSULE_ADDRESS?.trim() ||
    process.env.NEXT_PUBLIC_RITUAL_TIME_CAPSULE_ADDRESS?.trim() ||
    process.env.RITUAL_CAPSULE_ADDRESS?.trim() ||
    ""
  );
}

/**
 * Адреса лише з env (без «магічного» дефолту — на чейні має бути саме ваш деплой з `contracts/`).
 * Після зміни `.env.local` перезапустіть `next dev` — `NEXT_PUBLIC_*` підставляються на старті збірки.
 */
export function getCapsuleContractEnv(): CapsuleContractEnv {
  const raw = capsuleContractAddressRawFromEnv();

  if (!raw) return { status: "unset" };
  if (!ADDRESS_RE.test(raw)) {
    const hexPart = raw.startsWith("0x") ? raw.slice(2) : raw;
    const isHex = /^[a-fA-F0-9]*$/.test(hexPart);
    const detail = isHex
      ? `${hexPart.length} hex digits after 0x — an EVM address must be exactly 40.`
      : "Contains non-hex characters or wrong format.";
    return { status: "invalid", detail };
  }
  return { status: "ok", address: raw as Address };
}

export function getRitualCapsuleAddress(): Address | null {
  const env = getCapsuleContractEnv();
  return env.status === "ok" ? env.address : null;
}

/** Fallback for gas-minimal mints without public metadata. */
export const ONCHAIN_CAPSULE_TOKEN_URI = "";

export function buildMintMetadataUri(
  message: string,
  tag: CapsuleTag,
  image = "",
): string {
  const fullMessage = message.trim();
  const payload = JSON.stringify(
    image
      ? { m: fullMessage, c: tag, i: image }
      : { m: fullMessage, c: tag },
  );
  return `data:application/json,${payload}`;
}

export function buildCapsuleTokenUri(
  message: string,
  tag: CapsuleTag,
  image = "",
): string {
  return buildMintMetadataUri(message, tag, image);
}
