import { createPublicClient, http, type Address } from "viem";
import { ritualTestnet } from "@/lib/chain";
import type { CapsuleItem, CapsuleTag } from "@/lib/capsule-types";
import { normalizeBlockTimestampToSeconds } from "@/lib/chain-time";
import {
  getRitualCapsuleAddress,
  RITUAL_CAPSULE_ABI,
} from "@/lib/ritual-time-capsule-contract";

const publicClient = createPublicClient({
  chain: ritualTestnet,
  transport: http(),
});

type MintLog = {
  args: {
    tokenId?: bigint;
    owner?: Address;
    unlockTimestamp?: bigint | number;
  };
};

function normalizeUnlock(raw: bigint | number | undefined): number | undefined {
  if (raw == null) return undefined;
  return normalizeBlockTimestampToSeconds(Number(raw));
}

function isCapsuleTag(value: unknown): value is CapsuleTag {
  return (
    value === "Meme" ||
    value === "Work" ||
    value === "Personal" ||
    value === "Important" ||
    value === "Dream" ||
    value === "Nature" ||
    value === "Time"
  );
}

function parseTokenUri(tokenURI: string): Pick<CapsuleItem, "message" | "tag" | "userPhoto"> {
  if (!tokenURI.startsWith("data:")) {
    return { message: "", tag: "Personal", userPhoto: "" };
  }

  const comma = tokenURI.indexOf(",");
  if (comma === -1) {
    return { message: "", tag: "Personal", userPhoto: "" };
  }

  try {
    const rawJson = tokenURI.slice(comma + 1);
    let json = rawJson;
    try {
      json = decodeURIComponent(rawJson);
    } catch {
      json = rawJson;
    }
    const parsed = JSON.parse(json) as {
      message?: unknown;
      description?: unknown;
      d?: unknown;
      tag?: unknown;
      c?: unknown;
      image?: unknown;
      userPhoto?: unknown;
      photo?: unknown;
    };
    const tag = isCapsuleTag(parsed.tag)
      ? parsed.tag
      : isCapsuleTag(parsed.c)
        ? parsed.c
        : "Personal";
    const message =
      typeof parsed.message === "string"
        ? parsed.message
        : typeof parsed.description === "string"
          ? parsed.description
          : typeof parsed.d === "string"
            ? parsed.d
            : "";
    const userPhoto =
      typeof parsed.image === "string"
        ? parsed.image
        : typeof parsed.userPhoto === "string"
          ? parsed.userPhoto
          : typeof parsed.photo === "string"
            ? parsed.photo
            : "";
    return { message, tag, userPhoto };
  } catch {
    return { message: "", tag: "Personal", userPhoto: "" };
  }
}

export async function loadPublicOnchainCapsules(): Promise<CapsuleItem[]> {
  const address = getRitualCapsuleAddress();
  if (!address) return [];

  const logs = (await publicClient.getLogs({
    address,
    event: RITUAL_CAPSULE_ABI[0],
    fromBlock: BigInt(0),
    toBlock: "latest",
  })) as MintLog[];

  const newestFirst = [...logs].reverse();

  const capsules = await Promise.all(
    newestFirst.map(async (log): Promise<CapsuleItem | null> => {
      const tokenId = log.args.tokenId;
      if (tokenId == null) return null;

      try {
        const tokenURI = await publicClient.readContract({
          address,
          abi: RITUAL_CAPSULE_ABI,
          functionName: "tokenURI",
          args: [tokenId],
        });
        const metadata = parseTokenUri(tokenURI);

        return {
          id: `onchain-${tokenId.toString()}`,
          owner: log.args.owner?.toLowerCase(),
          unlockAtUnix: normalizeUnlock(log.args.unlockTimestamp),
          ...metadata,
        };
      } catch {
        return null;
      }
    }),
  );

  return capsules.filter((item): item is CapsuleItem => item != null);
}
