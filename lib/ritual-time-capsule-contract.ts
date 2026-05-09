import type { Address } from "viem";

/** RitualTimeCapsule — on-chain mint. Set `NEXT_PUBLIC_RITUAL_TIME_CAPSULE_ADDRESS` in `.env.local`. */
export type CapsuleContractEnv =
  | { status: "ok"; address: Address }
  | { status: "unset" }
  | { status: "invalid"; detail: string };

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/** Validates env; use for UI messages. Restart `next dev` after changing `.env.local`. */
export function getCapsuleContractEnv(): CapsuleContractEnv {
  const raw =
    process.env.NEXT_PUBLIC_RITUAL_TIME_CAPSULE_ADDRESS?.trim() ?? "";
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

export const ritualTimeCapsuleAbi = [
  {
    type: "function",
    name: "mintCapsule",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "unlockTimestamp", type: "uint256" },
      { name: "sealedTokenURI", type: "string" },
      { name: "openedTokenURI", type: "string" },
    ],
    outputs: [],
  },
] as const;

export function getRitualCapsuleAddress(): Address | null {
  const env = getCapsuleContractEnv();
  return env.status === "ok" ? env.address : null;
}

export function buildCapsuleTokenUris(params: {
  message: string;
  tag: string;
}): { sealed: string; opened: string } {
  const sealed = {
    name: "Ritual Time Capsule (Sealed)",
    description: params.message.slice(0, 500),
    attributes: [
      { trait_type: "Category", value: params.tag },
      { trait_type: "State", value: "sealed" },
    ],
  };
  const opened = {
    name: "Ritual Time Capsule (Opened)",
    description: params.message.slice(0, 500),
    attributes: [
      { trait_type: "Category", value: params.tag },
      { trait_type: "State", value: "opened" },
    ],
  };
  const toDataUri = (obj: object) =>
    `data:application/json;utf8,${encodeURIComponent(JSON.stringify(obj))}`;
  return { sealed: toDataUri(sealed), opened: toDataUri(opened) };
}
