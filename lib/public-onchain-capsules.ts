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

const LOG_CHUNK_SIZE = BigInt(100_000);
const LOGS_TIMEOUT_MS = 8_000;
const TOKEN_URI_TIMEOUT_MS = 8_000;
const MAX_LOG_CHUNKS_WITHOUT_DEPLOY_BLOCK = 25;
const PUBLIC_CAPSULE_CACHE_TTL_MS = 30_000;

let cachedCapsules:
  | { address: Address; loadedAtMs: number; items: CapsuleItem[] }
  | null = null;
let inFlightCapsules: Promise<CapsuleItem[]> | null = null;
let cacheGeneration = 0;

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

function ipfsToHttpGateway(uri: string): string {
  const trimmed = uri.trim();
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith("ipfs://")) return trimmed;
  const rest = trimmed.slice("ipfs://".length).replace(/^ipfs\//i, "");
  return `https://ipfs.io/ipfs/${rest}`;
}

/**
 * Turns on-chain tokenURI into a JSON string for metadata parsing.
 * Supports data: URIs, raw JSON, http(s), and ipfs:// (via gateway).
 */
async function resolveTokenUriToJsonString(
  tokenURI: string,
  context: { tokenId?: string },
): Promise<string> {
  const raw = tokenURI.trim();
  if (!raw) return "";

  if (raw.startsWith("{") && raw.endsWith("}")) {
    return raw;
  }

  if (raw.toLowerCase().startsWith("data:")) {
    const decoded = decodeTokenUriPayload(raw);
    if (!decoded) {
      console.debug("[PublicOnchainCapsules] data URI decode failed", {
        ...context,
        header: raw.slice(0, 80),
      });
    }
    return decoded ?? "";
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const res = await withTimeout(
        fetch(raw, {
          method: "GET",
          headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
          cache: "no-store",
        }),
        TOKEN_URI_TIMEOUT_MS,
      );
      if (!res.ok) {
        console.debug("[PublicOnchainCapsules] http tokenURI not OK", {
          ...context,
          status: res.status,
          url: raw.slice(0, 200),
        });
        return "";
      }
      return await withTimeout(res.text(), TOKEN_URI_TIMEOUT_MS);
    } catch (error) {
      console.debug("[PublicOnchainCapsules] http tokenURI fetch failed", {
        ...context,
        url: raw.slice(0, 200),
        error,
      });
      return "";
    }
  }

  if (raw.toLowerCase().startsWith("ipfs://")) {
    const gateway = ipfsToHttpGateway(raw);
    try {
      const res = await withTimeout(
        fetch(gateway, {
          method: "GET",
          headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
          cache: "no-store",
        }),
        TOKEN_URI_TIMEOUT_MS,
      );
      if (!res.ok) {
        console.debug("[PublicOnchainCapsules] ipfs gateway not OK", {
          ...context,
          status: res.status,
          gateway: gateway.slice(0, 200),
        });
        return "";
      }
      return await withTimeout(res.text(), TOKEN_URI_TIMEOUT_MS);
    } catch (error) {
      console.debug("[PublicOnchainCapsules] ipfs fetch failed", {
        ...context,
        gateway: gateway.slice(0, 200),
        error,
      });
      return "";
    }
  }

  console.debug("[PublicOnchainCapsules] unknown tokenURI scheme", {
    ...context,
    preview: raw.slice(0, 120),
  });
  return raw;
}

function pickString(...candidates: unknown[]): string {
  for (const v of candidates) {
    if (typeof v === "string") {
      const s = v.trim();
      if (s.length > 0) return s;
    }
  }
  return "";
}

function parseMetadataJson(
  json: string,
  context: { tokenId?: string },
): Pick<CapsuleItem, "message" | "tag" | "userPhoto"> {
  if (!json.trim()) {
    return { message: "", tag: "Personal", userPhoto: "" };
  }

  try {
    const parsed = JSON.parse(json) as {
      m?: unknown;
      message?: unknown;
      description?: unknown;
      d?: unknown;
      body?: unknown;
      text?: unknown;
      content?: unknown;
      name?: unknown;
      tag?: unknown;
      c?: unknown;
      i?: unknown;
      image?: unknown;
      image_url?: unknown;
      image_data?: unknown;
      userPhoto?: unknown;
      photo?: unknown;
      picture?: unknown;
      animation_url?: unknown;
    };

    const tag = isCapsuleTag(parsed.tag)
      ? parsed.tag
      : isCapsuleTag(parsed.c)
        ? parsed.c
        : "Personal";

    const message = pickString(
      parsed.m,
      parsed.message,
      parsed.description,
      parsed.d,
      parsed.body,
      parsed.text,
      typeof parsed.content === "string" ? parsed.content : undefined,
      parsed.name,
    );

    const userPhoto = pickString(
      parsed.i,
      parsed.image,
      parsed.image_url,
      parsed.image_data,
      parsed.userPhoto,
      parsed.photo,
      parsed.picture,
      parsed.animation_url,
    );

    if (!message && !userPhoto) {
      console.debug("[PublicOnchainCapsules] parsed metadata has no message/photo", {
        ...context,
        keys: parsed && typeof parsed === "object" ? Object.keys(parsed) : [],
        jsonPreview: json.slice(0, 160),
      });
    }

    return { message, tag, userPhoto };
  } catch (error) {
    console.debug("[PublicOnchainCapsules] JSON.parse failed for metadata", {
      ...context,
      error,
      jsonPreview: json.slice(0, 200),
    });
    return { message: "", tag: "Personal", userPhoto: "" };
  }
}

async function parseTokenUriAsync(
  tokenURI: string,
  context: { tokenId?: string },
): Promise<Pick<CapsuleItem, "message" | "tag" | "userPhoto">> {
  const json = await resolveTokenUriToJsonString(tokenURI, context);
  return parseMetadataJson(json, context);
}

export async function loadPublicOnchainCapsuleById(
  tokenId: bigint,
): Promise<CapsuleItem | null> {
  const address = getRitualCapsuleAddress();
  if (!address) return null;

  const idStr = tokenId.toString();
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
    const metadata = await parseTokenUriAsync(tokenURI, { tokenId: idStr });
    const item: CapsuleItem = {
      id: `onchain-${idStr}`,
      ...metadata,
    };

    if (cachedCapsules?.address.toLowerCase() === address.toLowerCase()) {
      const withoutCurrent = cachedCapsules.items.filter(
        (capsule) => capsule.id !== item.id,
      );
      cachedCapsules = {
        address,
        loadedAtMs: Date.now(),
        items: [item, ...withoutCurrent],
      };
    }

    console.debug("[PublicOnchainCapsules] direct tokenURI", {
      id: item.id,
      hasPhoto: Boolean(item.userPhoto),
      messageLength: item.message.length,
      tokenUriPreview: String(tokenURI).slice(0, 100),
    });

    return item;
  } catch (error) {
    console.warn("[PublicOnchainCapsules] failed direct tokenURI read", {
      tokenId: idStr,
      error,
    });
    return null;
  }
}

async function loadMintLogsChunked(
  address: Address,
  latestBlock: bigint,
): Promise<MintLog[]> {
  const deployBlock = deploymentBlockFromEnv();
  const fromBlock =
    deployBlock ??
    (latestBlock > LOG_CHUNK_SIZE * BigInt(MAX_LOG_CHUNKS_WITHOUT_DEPLOY_BLOCK)
      ? latestBlock - LOG_CHUNK_SIZE * BigInt(MAX_LOG_CHUNKS_WITHOUT_DEPLOY_BLOCK)
      : BigInt(0));
  const safeFromBlock = fromBlock > latestBlock ? latestBlock : fromBlock;

  const logs: MintLog[] = [];
  let chunkCount = 0;
  let toBlock = latestBlock;
  let stoppedByChunkLimit = false;

  while (toBlock >= safeFromBlock) {
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
    if (!deployBlock && chunkCount >= MAX_LOG_CHUNKS_WITHOUT_DEPLOY_BLOCK) {
      stoppedByChunkLimit = true;
      break;
    }
    toBlock = chunkFrom - BigInt(1);
  }

  console.debug("[PublicOnchainCapsules] logs", {
    address,
    fromBlock: safeFromBlock.toString(),
    toBlock: latestBlock.toString(),
    chunkCount,
    count: logs.length,
    deployBlock: deployBlock?.toString() ?? null,
    stoppedByChunkLimit,
    note: deployBlock
      ? "Loaded from configured deploy block."
      : "Set NEXT_PUBLIC_RITUAL_CAPSULE_DEPLOY_BLOCK to scan full contract history.",
  });

  return logs;
}

async function loadPublicOnchainCapsulesFresh(): Promise<CapsuleItem[]> {
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

  const newestFirst = [...logs].reverse();

  const capsules = await Promise.all(
    newestFirst.map(async (log): Promise<CapsuleItem | null> => {
      const tokenId = log.args.tokenId;
      if (tokenId == null) return null;

      const idStr = tokenId.toString();
      const unlockAtUnix = normalizeUnlock(log.args.unlockTimestamp);
      if (unlockAtUnix == null) {
        console.debug("[PublicOnchainCapsules] mint log missing unlockTimestamp", {
          tokenId: idStr,
          args: log.args,
        });
      }

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
        const metadata = await parseTokenUriAsync(tokenURI, { tokenId: idStr });

        return {
          id: `onchain-${idStr}`,
          owner: log.args.owner?.toLowerCase(),
          unlockAtUnix,
          ...metadata,
        };
      } catch (error) {
        console.warn("[PublicOnchainCapsules] failed tokenURI read", {
          tokenId: idStr,
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

export async function loadPublicOnchainCapsules(): Promise<CapsuleItem[]> {
  const address = getRitualCapsuleAddress();
  if (!address) return [];

  const now = Date.now();
  if (
    cachedCapsules &&
    cachedCapsules.address.toLowerCase() === address.toLowerCase() &&
    now - cachedCapsules.loadedAtMs <= PUBLIC_CAPSULE_CACHE_TTL_MS
  ) {
    return cachedCapsules.items;
  }

  if (inFlightCapsules) {
    return inFlightCapsules;
  }

  const generation = cacheGeneration;
  inFlightCapsules = loadPublicOnchainCapsulesFresh().then(
    (items) => {
      if (generation === cacheGeneration && items.length > 0) {
        cachedCapsules = { address, loadedAtMs: Date.now(), items };
      }
      if (generation === cacheGeneration) {
        inFlightCapsules = null;
      }
      return items.length > 0 ? items : (cachedCapsules?.items ?? []);
    },
    (error) => {
      if (generation === cacheGeneration) {
        inFlightCapsules = null;
      }
      console.warn("[PublicOnchainCapsules] uncached load failed", error);
      return cachedCapsules?.items ?? [];
    },
  );

  return inFlightCapsules;
}

export function clearPublicOnchainCapsulesCache(): void {
  cacheGeneration += 1;
  cachedCapsules = null;
  inFlightCapsules = null;
}
