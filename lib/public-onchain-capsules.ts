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

const CAPSULE_MINTED_EVENT = RITUAL_CAPSULE_ABI.find(
  (item) => item.type === "event" && item.name === "CapsuleMinted",
);

const DEFAULT_EVENT_LOOKBACK_BLOCKS = BigInt(2_000_000);
const LOG_CHUNK_SIZE = BigInt(100_000);
const LOGS_TIMEOUT_MS = 8_000;
const TOKEN_URI_TIMEOUT_MS = 8_000;
const MAX_TOKEN_URI_READS = 200;

type MintLog = {
  args: {
    tokenId?: bigint;
    owner?: Address;
    unlockTimestamp?: bigint | number;
  };
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(new Error(`Timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function deploymentBlockFromEnv(): bigint | null {
  const raw =
    process.env.NEXT_PUBLIC_RITUAL_CAPSULE_DEPLOY_BLOCK?.trim() ||
    process.env.NEXT_PUBLIC_RITUAL_TIME_CAPSULE_DEPLOY_BLOCK?.trim() ||
    "";
  if (!/^\d+$/.test(raw)) return null;
  return BigInt(raw);
}

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

function decodeBase64(value: string): string {
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(value);
  }
  return Buffer.from(value, "base64").toString("utf8");
}

function decodeTokenUriPayload(tokenURI: string): string | null {
  const comma = tokenURI.indexOf(",");
  if (comma === -1) return null;

  const header = tokenURI.slice(0, comma).toLowerCase();
  const rawPayload = tokenURI.slice(comma + 1);

  if (header.includes(";base64")) {
    try {
      return decodeBase64(rawPayload);
    } catch {
      return null;
    }
  }

  try {
    return decodeURIComponent(rawPayload);
  } catch {
    return rawPayload;
  }
}

function parseTokenUri(tokenURI: string): Pick<CapsuleItem, "message" | "tag" | "userPhoto"> {
  if (!tokenURI.startsWith("data:")) {
    return { message: "", tag: "Personal", userPhoto: "" };
  }

  try {
    const json = decodeTokenUriPayload(tokenURI);
    if (!json) return { message: "", tag: "Personal", userPhoto: "" };

    const parsed = JSON.parse(json) as {
      m?: unknown;
      message?: unknown;
      description?: unknown;
      d?: unknown;
      tag?: unknown;
      c?: unknown;
      i?: unknown;
      image?: unknown;
      image_data?: unknown;
      userPhoto?: unknown;
      photo?: unknown;
    };
    const tag = isCapsuleTag(parsed.tag)
      ? parsed.tag
      : isCapsuleTag(parsed.c)
        ? parsed.c
        : "Personal";
    const message =
      typeof parsed.m === "string"
        ? parsed.m
        : typeof parsed.message === "string"
        ? parsed.message
        : typeof parsed.description === "string"
          ? parsed.description
          : typeof parsed.d === "string"
            ? parsed.d
            : "";
    const userPhoto =
      typeof parsed.i === "string"
        ? parsed.i
        : typeof parsed.image === "string"
        ? parsed.image
        : typeof parsed.image_data === "string"
          ? parsed.image_data
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

async function loadMintLogsChunked(
  address: Address,
  latestBlock: bigint,
): Promise<MintLog[]> {
  const deployBlock = deploymentBlockFromEnv();
  const fromBlock =
    deployBlock ?? (
      latestBlock > DEFAULT_EVENT_LOOKBACK_BLOCKS
        ? latestBlock - DEFAULT_EVENT_LOOKBACK_BLOCKS
        : BigInt(0)
    );
  const safeFromBlock = fromBlock > latestBlock ? latestBlock : fromBlock;

  const logs: MintLog[] = [];
  let chunkCount = 0;
  let toBlock = latestBlock;

  while (toBlock >= safeFromBlock && logs.length < MAX_TOKEN_URI_READS) {
    const chunkFrom =
      toBlock - safeFromBlock >= LOG_CHUNK_SIZE
        ? toBlock - LOG_CHUNK_SIZE + BigInt(1)
        : safeFromBlock;

    try {
      const chunk = (await withTimeout(
        publicClient.getLogs({
          address,
          event: CAPSULE_MINTED_EVENT,
          fromBlock: chunkFrom,
          toBlock,
        }),
        LOGS_TIMEOUT_MS,
      )) as MintLog[];
      logs.unshift(...chunk);
    } catch (error) {
      console.warn("[PublicOnchainCapsules] failed log chunk", {
        fromBlock: chunkFrom.toString(),
        toBlock: toBlock.toString(),
        error,
      });
    }

    chunkCount += 1;
    if (chunkFrom === safeFromBlock) break;
    toBlock = chunkFrom - BigInt(1);
  }

  console.debug("[PublicOnchainCapsules] logs", {
    address,
    fromBlock: safeFromBlock.toString(),
    toBlock: latestBlock.toString(),
    chunkCount,
    count: logs.length,
    deployBlock: deployBlock?.toString() ?? null,
  });

  return logs;
}

export async function loadPublicOnchainCapsules(): Promise<CapsuleItem[]> {
  const address = getRitualCapsuleAddress();
  if (!address) return [];

  let logs: MintLog[] = [];
  try {
    const latestBlock = await withTimeout(
      publicClient.getBlockNumber(),
      LOGS_TIMEOUT_MS,
    );
    logs = await loadMintLogsChunked(address, latestBlock);
  } catch (error) {
    console.warn("[PublicOnchainCapsules] failed to load logs", error);
    return [];
  }

  const newestFirst = [...logs].reverse().slice(0, MAX_TOKEN_URI_READS);

  const capsules = await Promise.all(
    newestFirst.map(async (log): Promise<CapsuleItem | null> => {
      const tokenId = log.args.tokenId;
      if (tokenId == null) return null;

      try {
        const tokenURI = await withTimeout(
          publicClient.readContract({
            address,
            abi: RITUAL_CAPSULE_ABI,
            functionName: "tokenURI",
            args: [tokenId],
          }),
          TOKEN_URI_TIMEOUT_MS,
        );
        const metadata = parseTokenUri(tokenURI);

        return {
          id: `onchain-${tokenId.toString()}`,
          owner: log.args.owner?.toLowerCase(),
          unlockAtUnix: normalizeUnlock(log.args.unlockTimestamp),
          ...metadata,
        };
      } catch (error) {
        console.warn("[PublicOnchainCapsules] failed tokenURI read", {
          tokenId: tokenId.toString(),
          error,
        });
        return null;
      }
    }),
  );

  const parsed = capsules.filter((item): item is CapsuleItem => item != null);
  console.debug("[PublicOnchainCapsules] parsed", {
    count: parsed.length,
    items: parsed.map((item) => ({
      id: item.id,
      owner: item.owner,
      unlockAtUnix: item.unlockAtUnix,
      hasPhoto: Boolean(item.userPhoto),
      messageLength: item.message.length,
    })),
  });
  return parsed;
}
