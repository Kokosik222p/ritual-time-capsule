import { createPublicClient, http, type Address } from "viem";
import { ritualTestnet } from "@/lib/chain";
import type { CapsuleItem, CapsuleTag } from "@/lib/capsule-types";
import { normalizeBlockTimestampToSeconds } from "@/lib/chain-time";
import {
  applyMetadataCache,
  persistMetadataCache,
} from "@/lib/capsule-metadata-cache";
import {
  isReliableUnlockTimestamp,
  sanitizeCapsuleUnlockFields,
} from "@/lib/capsule-unlock";
import { sanitizeCapsulePhotoUrl } from "@/lib/capsule-media";
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

const LOG_CHUNK_SIZE = BigInt(30_000);
const LOG_CHUNKS_PARALLEL = 3;
const LOGS_TIMEOUT_MS = 12_000;
const TOKEN_URI_TIMEOUT_MS = 25_000;
const MAX_LOG_CHUNKS_WITHOUT_DEPLOY_BLOCK = 8;
const METADATA_CONCURRENCY = 8;
const TOKEN_PROBE_BATCH = 24;
const MAX_TOKEN_PROBE = 512;
const NOTIFY_THROTTLE_MS = 120;
const PUBLIC_CAPSULE_FRESH_TTL_MS = 60_000;
const PERSIST_STORAGE_KEY = "ritual-public-onchain-capsules-v4";

let cachedCapsules:
  | { address: Address; loadedAtMs: number; items: CapsuleItem[] }
  | null = null;
let inFlightCapsules: Promise<CapsuleItem[]> | null = null;
let inFlightHydration: Promise<void> | null = null;
let cacheGeneration = 0;

const cacheListeners = new Set<() => void>();
let notifyTimer: ReturnType<typeof setTimeout> | null = null;

function notifyCacheListeners(): void {
  for (const listener of cacheListeners) {
    try {
      listener();
    } catch (error) {
      console.warn("[PublicOnchainCapsules] cache listener error", error);
    }
  }
}

function notifyCacheListenersThrottled(): void {
  if (typeof window === "undefined") {
    notifyCacheListeners();
    return;
  }
  if (notifyTimer != null) return;
  notifyTimer = globalThis.setTimeout(() => {
    notifyTimer = null;
    notifyCacheListeners();
  }, NOTIFY_THROTTLE_MS);
}

export function subscribePublicOnchainCapsules(listener: () => void): () => void {
  cacheListeners.add(listener);
  return () => cacheListeners.delete(listener);
}

function withMetadataCache(items: CapsuleItem[]): CapsuleItem[] {
  return applyMetadataCache(items);
}

/** Instant read for UI (memory → sessionStorage → local metadata cache). */
export function getCachedPublicOnchainCapsules(): CapsuleItem[] {
  const address = getRitualCapsuleAddress();
  if (!address) return [];
  let items: CapsuleItem[];
  if (
    cachedCapsules &&
    cachedCapsules.address.toLowerCase() === address.toLowerCase()
  ) {
    items = cachedCapsules.items;
  } else {
    items = readPersistedCapsules(address);
  }
  return withMetadataCache(items);
}

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

  const trimmed = rawPayload.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
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
    return decoded ?? "";
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const res = await withTimeout(
        fetch(raw, {
          method: "GET",
          headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
          cache: "force-cache",
        }),
        TOKEN_URI_TIMEOUT_MS,
      );
      if (!res.ok) return "";
      return await withTimeout(res.text(), TOKEN_URI_TIMEOUT_MS);
    } catch (error) {
      console.debug("[PublicOnchainCapsules] http tokenURI fetch failed", {
        ...context,
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
          cache: "force-cache",
        }),
        TOKEN_URI_TIMEOUT_MS,
      );
      if (!res.ok) return "";
      return await withTimeout(res.text(), TOKEN_URI_TIMEOUT_MS);
    } catch (error) {
      console.debug("[PublicOnchainCapsules] ipfs fetch failed", {
        ...context,
        error,
      });
      return "";
    }
  }

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

function photoFromMetadataRecord(
  record: Record<string, unknown>,
): string {
  return pickString(
    record.i,
    record.image,
    record.image_url,
    record.image_data,
    record.userPhoto,
    record.photo,
    record.picture,
    record.animation_url,
  );
}

/** Reads a JSON string value without parsing the whole document (handles large base64 photos). */
function extractJsonStringField(json: string, field: string): string {
  const marker = `"${field}"`;
  const markerIndex = json.indexOf(marker);
  if (markerIndex === -1) return "";

  let i = markerIndex + marker.length;
  while (i < json.length && (json[i] === ":" || json[i] === " ")) i += 1;
  if (json[i] !== '"') return "";
  i += 1;

  let raw = "";
  while (i < json.length) {
    const ch = json[i]!;
    if (ch === "\\") {
      const next = json[i + 1];
      if (next === "n") raw += "\n";
      else if (next === "r") raw += "\r";
      else if (next === "t") raw += "\t";
      else if (next != null) raw += next;
      i += 2;
      continue;
    }
    if (ch === '"') break;
    raw += ch;
    i += 1;
  }

  return raw.trim();
}

function tagFromMetadataJson(json: string, parsed?: Record<string, unknown>): CapsuleTag {
  if (parsed) {
    if (isCapsuleTag(parsed.tag)) return parsed.tag;
    if (isCapsuleTag(parsed.c)) return parsed.c;
  }
  const raw = extractJsonStringField(json, "c") || extractJsonStringField(json, "tag");
  return isCapsuleTag(raw) ? raw : "Personal";
}

function parseMetadataJson(
  json: string,
): Pick<CapsuleItem, "message" | "tag" | "userPhoto"> {
  if (!json.trim()) {
    return { message: "", tag: "Personal", userPhoto: "" };
  }

  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    parsed = undefined;
  }

  if (parsed) {
    const tag = tagFromMetadataJson(json, parsed);
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
    let userPhoto = photoFromMetadataRecord(parsed);

    if (!userPhoto && Array.isArray(parsed.attributes)) {
      for (const entry of parsed.attributes) {
        if (!entry || typeof entry !== "object") continue;
        const attr = entry as Record<string, unknown>;
        const trait = String(attr.trait_type ?? attr.trait ?? "").toLowerCase();
        if (
          trait === "image" ||
          trait === "photo" ||
          trait === "picture" ||
          trait === "i"
        ) {
          userPhoto = pickString(attr.value);
          if (userPhoto) break;
        }
      }
    }

    return {
      message: message || extractJsonStringField(json, "m"),
      tag,
      userPhoto: sanitizeCapsulePhotoUrl(
        userPhoto || extractJsonStringField(json, "i"),
      ),
    };
  }

  return {
    message:
      extractJsonStringField(json, "m") ||
      extractJsonStringField(json, "message"),
    tag: tagFromMetadataJson(json),
    userPhoto: sanitizeCapsulePhotoUrl(
      extractJsonStringField(json, "i") ||
        extractJsonStringField(json, "image") ||
        extractJsonStringField(json, "userPhoto"),
    ),
  };
}

async function parseTokenUriAsync(
  tokenURI: string,
  context: { tokenId?: string },
): Promise<Pick<CapsuleItem, "message" | "tag" | "userPhoto">> {
  const json = await resolveTokenUriToJsonString(tokenURI, context);
  return parseMetadataJson(json);
}

function tokenIdFromCapsuleId(id: string): bigint | null {
  const raw = id.startsWith("onchain-") ? id.slice("onchain-".length) : id;
  if (!/^\d+$/.test(raw)) return null;
  return BigInt(raw);
}

function hydrationCanonKey(item: CapsuleItem): string {
  const unlock = normalizeUnlock(item.unlockAtUnix) ?? 0;
  return `${item.owner?.toLowerCase() || ""}|${unlock}|${item.tag}`;
}

function resolveHydrationTokenId(
  item: CapsuleItem,
  pool: CapsuleItem[],
): bigint | null {
  const direct = tokenIdFromCapsuleId(item.id);
  if (direct != null) return direct;

  const canon = hydrationCanonKey(item);
  for (const candidate of pool) {
    if (!candidate.id.startsWith("onchain-")) continue;
    if (hydrationCanonKey(candidate) !== canon) continue;
    const tokenId = tokenIdFromCapsuleId(candidate.id);
    if (tokenId != null) return tokenId;
  }
  return null;
}

function shellFromMintLog(log: MintLog): CapsuleItem | null {
  const tokenId = log.args.tokenId;
  if (tokenId == null) return null;
  const idStr = tokenId.toString();
  return {
    id: `onchain-${idStr}`,
    owner: log.args.owner?.toLowerCase(),
    unlockAtUnix: normalizeUnlock(log.args.unlockTimestamp),
    message: "",
    tag: "Personal",
    userPhoto: "",
  };
}

/**
 * Ritual Testnet has no Multicall3 in viem chain config — probe with sequential ownerOf.
 */
async function discoverMintedTokenIds(address: Address): Promise<bigint[]> {
  const ids: bigint[] = [];
  const max = BigInt(MAX_TOKEN_PROBE);

  for (let tokenId = BigInt(1); tokenId <= max; tokenId += BigInt(1)) {
    try {
      await publicClient.readContract({
        address,
        abi: RITUAL_CAPSULE_ABI,
        functionName: "ownerOf",
        args: [tokenId],
      });
      ids.push(tokenId);
    } catch {
      break;
    }
  }

  return ids;
}

async function readOnchainCapsuleState(
  address: Address,
  tokenId: bigint,
): Promise<{ owner: string; opened: boolean } | null> {
  try {
    const [owner, opened] = await Promise.all([
      publicClient.readContract({
        address,
        abi: RITUAL_CAPSULE_ABI,
        functionName: "ownerOf",
        args: [tokenId],
      }),
      publicClient.readContract({
        address,
        abi: RITUAL_CAPSULE_ABI,
        functionName: "isOpened",
        args: [tokenId],
      }),
    ]);
    return { owner: owner.toLowerCase(), opened: Boolean(opened) };
  } catch {
    return null;
  }
}

function unlockFallbackForProbedToken(opened: boolean): number | undefined {
  if (opened) return undefined;
  return Math.floor(Date.now() / 1000) + 365 * 86400;
}

async function shellsFromDiscoveredTokens(
  address: Address,
  tokenIds: bigint[],
  mintByTokenId: Map<string, CapsuleItem>,
): Promise<CapsuleItem[]> {
  const built = await mapWithConcurrency(
    tokenIds,
    async (tokenId) => {
      const fromLog = mintByTokenId.get(tokenId.toString());
      if (
        fromLog?.owner &&
        (isReliableUnlockTimestamp(fromLog.unlockAtUnix) ||
          fromLog.openedOnChain != null)
      ) {
        return fromLog;
      }

      const state = await readOnchainCapsuleState(address, tokenId);
      if (!state) return fromLog ?? null;

      const fromLogComplete =
        fromLog?.owner &&
        isReliableUnlockTimestamp(fromLog.unlockAtUnix) &&
        fromLog.openedOnChain == null;

      return {
        id: `onchain-${tokenId.toString()}`,
        owner: state.owner,
        unlockAtUnix: fromLogComplete
          ? fromLog.unlockAtUnix
          : unlockFallbackForProbedToken(state.opened),
        openedOnChain: fromLogComplete ? undefined : state.opened,
        message: fromLog?.message ?? "",
        tag: fromLog?.tag ?? "Personal",
        userPhoto: fromLog?.userPhoto ?? "",
      } satisfies CapsuleItem;
    },
    TOKEN_PROBE_BATCH,
  );

  return built.filter((item): item is CapsuleItem => item != null);
}

export function needsOnchainMetadataHydration(item: CapsuleItem): boolean {
  return !item.message.trim() || !item.userPhoto.trim();
}

function needsMetadataHydration(item: CapsuleItem): boolean {
  return needsOnchainMetadataHydration(item);
}

function mergeCapsuleItems(
  previous: CapsuleItem[],
  next: CapsuleItem[],
): CapsuleItem[] {
  const byId = new Map<string, CapsuleItem>();
  for (const item of previous) {
    byId.set(item.id, item);
  }
  for (const item of next) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      continue;
    }
    byId.set(item.id, {
      ...existing,
      ...item,
      owner: item.owner ?? existing.owner,
      unlockAtUnix: item.unlockAtUnix ?? existing.unlockAtUnix,
      openedOnChain: item.openedOnChain ?? existing.openedOnChain,
      message: item.message.trim() ? item.message : existing.message,
      userPhoto: item.userPhoto.trim() ? item.userPhoto : existing.userPhoto,
      tag: item.tag || existing.tag,
    });
  }
  return Array.from(byId.values());
}

function readPersistedCapsules(address: Address): CapsuleItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(PERSIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as {
      address?: string;
      items?: CapsuleItem[];
    };
    if (parsed.address?.toLowerCase() !== address.toLowerCase()) return [];
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function writePersistedCapsules(address: Address, items: CapsuleItem[]): void {
  if (typeof window === "undefined" || items.length === 0) return;
  try {
    window.sessionStorage.setItem(
      PERSIST_STORAGE_KEY,
      JSON.stringify({ address, items, savedAtMs: Date.now() }),
    );
  } catch {
    // quota / private mode
  }
}

function commitCapsuleCache(address: Address, items: CapsuleItem[]): void {
  const enriched = withMetadataCache(
    items.map((item) =>
      sanitizeCapsuleUnlockFields({
        ...item,
        userPhoto: sanitizeCapsulePhotoUrl(item.userPhoto),
      }),
    ),
  );
  persistMetadataCache(enriched);
  cachedCapsules = { address, loadedAtMs: Date.now(), items: enriched };
  writePersistedCapsules(address, enriched);
  notifyCacheListenersThrottled();
}

async function mapWithConcurrency<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current]!);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

async function hydrateCapsuleMetadata(
  address: Address,
  item: CapsuleItem,
  pool: CapsuleItem[],
): Promise<CapsuleItem> {
  const tokenId = resolveHydrationTokenId(item, pool);
  if (tokenId == null) return item;

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
    const metadata = await parseTokenUriAsync(tokenURI, {
      tokenId: tokenId.toString(),
    });
    const preferId = item.id.startsWith("onchain-")
      ? item.id
      : `onchain-${tokenId.toString()}`;
    return {
      ...item,
      ...metadata,
      id: preferId,
      userPhoto: sanitizeCapsulePhotoUrl(metadata.userPhoto),
    };
  } catch (error) {
    console.debug("[PublicOnchainCapsules] hydrate failed", {
      id: item.id,
      error,
    });
    return item;
  }
}

function sortForMetadataPriority(
  items: CapsuleItem[],
  chainNowSec: number,
): CapsuleItem[] {
  const now = normalizeBlockTimestampToSeconds(chainNowSec);
  return [...items].sort((a, b) => {
    const unlockA = normalizeUnlock(a.unlockAtUnix as number | undefined) ?? 0;
    const unlockB = normalizeUnlock(b.unlockAtUnix as number | undefined) ?? 0;
    const openedA = unlockA > 0 && unlockA <= now;
    const openedB = unlockB > 0 && unlockB <= now;
    if (openedA !== openedB) return openedA ? -1 : 1;
    return unlockB - unlockA;
  });
}

function isOpenedItem(item: CapsuleItem, chainNowSec: number): boolean {
  if (item.openedOnChain === true) return true;
  if (item.openedOnChain === false) return false;
  const unlock = normalizeUnlock(item.unlockAtUnix);
  const now = normalizeBlockTimestampToSeconds(chainNowSec);
  if (unlock == null) return false;
  if (!Number.isFinite(now) || now <= 0) {
    return unlock <= Math.floor(Date.now() / 1000);
  }
  return unlock <= now;
}

async function hydrateCapsulesInBackground(
  address: Address,
  items: CapsuleItem[],
  chainNowSec: number,
  hydrateOpenedLimit?: number,
): Promise<CapsuleItem[]> {
  const generation = cacheGeneration;
  const ordered = sortForMetadataPriority(items, chainNowSec);
  const opened = ordered.filter(
    (item) => isOpenedItem(item, chainNowSec) && needsMetadataHydration(item),
  );
  const sealed = ordered.filter(
    (item) => !isOpenedItem(item, chainNowSec) && needsMetadataHydration(item),
  );

  const openedFirst = hydrateOpenedLimit
    ? opened.slice(0, hydrateOpenedLimit)
    : opened;
  const openedLater = hydrateOpenedLimit
    ? opened.slice(hydrateOpenedLimit)
    : [];

  const hydrateList = async (list: CapsuleItem[]) => {
    if (list.length === 0) return;
    const pool = cachedCapsules?.items ?? items;
    const hydrated = await mapWithConcurrency(
      list,
      (item) => hydrateCapsuleMetadata(address, item, pool),
      METADATA_CONCURRENCY,
    );
    if (generation !== cacheGeneration) return;
    const current = cachedCapsules?.items ?? items;
    commitCapsuleCache(address, mergeCapsuleItems(current, hydrated));
  };

  if (hydrateOpenedLimit) {
    await hydrateList(openedFirst);
    void hydrateList(openedLater);
  } else {
    void hydrateList(opened);
  }
  void hydrateList(sealed);
  return cachedCapsules?.items ?? items;
}

/** Hydrate tokenURI metadata for specific capsules; updates shared cache + notifies UI. */
export async function hydrateCapsulesMetadata(
  items: CapsuleItem[],
  chainNowSec: number,
): Promise<CapsuleItem[]> {
  const address = getRitualCapsuleAddress();
  if (!address || items.length === 0) return items;

  const toHydrate = items.filter(needsMetadataHydration);
  if (toHydrate.length === 0) return items;

  const pool = getCachedPublicOnchainCapsules();
  const hydrated = await mapWithConcurrency(
    toHydrate,
    (item) => hydrateCapsuleMetadata(address, item, pool),
    METADATA_CONCURRENCY,
  );
  commitCapsuleCache(
    address,
    mergeCapsuleItems(getCachedPublicOnchainCapsules(), hydrated),
  );
  void hydrateCapsulesInBackground(
    address,
    getCachedPublicOnchainCapsules(),
    chainNowSec,
  );

  const byId = new Map(
    mergeCapsuleItems(getCachedPublicOnchainCapsules(), hydrated).map(
      (item) => [item.id, item],
    ),
  );
  return items.map((item) => byId.get(item.id) ?? item);
}

/** Fire-and-forget hydration for opened capsules missing photo/message. */
export function scheduleHydrateCapsules(
  items: CapsuleItem[],
  chainNowSec: number,
): void {
  const address = getRitualCapsuleAddress();
  if (!address) return;
  const targets = items.filter(needsMetadataHydration);
  if (targets.length === 0) return;
  void hydrateCapsulesMetadata(targets, chainNowSec);
}

async function loadMintLogsChunked(
  address: Address,
  latestBlock: bigint,
): Promise<MintLog[]> {
  const deployBlock = deploymentBlockFromEnv();
  const fromBlock =
    deployBlock ??
    (latestBlock > LOG_CHUNK_SIZE * BigInt(MAX_LOG_CHUNKS_WITHOUT_DEPLOY_BLOCK)
      ? latestBlock -
        LOG_CHUNK_SIZE * BigInt(MAX_LOG_CHUNKS_WITHOUT_DEPLOY_BLOCK)
      : BigInt(0));
  const safeFromBlock = fromBlock > latestBlock ? latestBlock : fromBlock;

  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  let toBlock = latestBlock;
  let chunkCount = 0;

  while (toBlock >= safeFromBlock) {
    const chunkFrom =
      toBlock - safeFromBlock >= LOG_CHUNK_SIZE
        ? toBlock - LOG_CHUNK_SIZE + BigInt(1)
        : safeFromBlock;
    ranges.push({ fromBlock: chunkFrom, toBlock });
    chunkCount += 1;
    if (chunkFrom === safeFromBlock) break;
    if (
      !deployBlock &&
      chunkCount >= MAX_LOG_CHUNKS_WITHOUT_DEPLOY_BLOCK
    ) {
      break;
    }
    toBlock = chunkFrom - BigInt(1);
  }

  const logs: MintLog[] = [];
  for (let i = 0; i < ranges.length; i += LOG_CHUNKS_PARALLEL) {
    const batch = ranges.slice(i, i + LOG_CHUNKS_PARALLEL);
    const chunks = await Promise.all(
      batch.map(async ({ fromBlock, toBlock: chunkTo }) => {
        const fetchChunk = async () =>
          (await withTimeout(
            publicClient.getLogs({
              address,
              event: CAPSULE_MINTED_EVENT,
              fromBlock,
              toBlock: chunkTo,
            }),
            LOGS_TIMEOUT_MS,
          )) as MintLog[];

        try {
          return await fetchChunk();
        } catch (error) {
          console.warn("[PublicOnchainCapsules] retrying log chunk", {
            fromBlock: fromBlock.toString(),
            toBlock: chunkTo.toString(),
            error,
          });
          try {
            return await fetchChunk();
          } catch (retryError) {
            console.warn("[PublicOnchainCapsules] failed log chunk", {
              fromBlock: fromBlock.toString(),
              toBlock: chunkTo.toString(),
              error: retryError,
            });
            return [] as MintLog[];
          }
        }
      }),
    );
    for (const chunk of chunks) {
      logs.unshift(...chunk);
    }
  }

  return logs;
}

async function loadShellsFromChain(address: Address): Promise<CapsuleItem[]> {
  const latestBlock = await withTimeout(
    publicClient.getBlockNumber(),
    LOGS_TIMEOUT_MS,
  );
  const logs = await loadMintLogsChunked(address, latestBlock);
  const mintByTokenId = new Map<string, CapsuleItem>();
  for (const log of logs) {
    const shell = shellFromMintLog(log);
    if (!shell) continue;
    const rawId = shell.id.startsWith("onchain-")
      ? shell.id.slice("onchain-".length)
      : shell.id;
    mintByTokenId.set(rawId, shell);
  }

  let discovered: bigint[] = [];
  try {
    discovered = await discoverMintedTokenIds(address);
  } catch (error) {
    console.warn("[PublicOnchainCapsules] token discovery failed", error);
  }

  const tokenIds =
    discovered.length > 0
      ? discovered
      : [...mintByTokenId.keys()].map((id) => BigInt(id));

  if (tokenIds.length === 0) {
    return [];
  }

  const shells = await shellsFromDiscoveredTokens(
    address,
    tokenIds,
    mintByTokenId,
  );

  return shells.sort((a, b) => {
    const idA = BigInt(
      a.id.startsWith("onchain-") ? a.id.slice("onchain-".length) : a.id,
    );
    const idB = BigInt(
      b.id.startsWith("onchain-") ? b.id.slice("onchain-".length) : b.id,
    );
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });
}

async function loadPublicOnchainCapsulesFresh(
  chainNowSec: number,
  options?: { hydrateOpenedLimit?: number },
): Promise<CapsuleItem[]> {
  const address = getRitualCapsuleAddress();
  if (!address) return [];

  const generation = cacheGeneration;
  const previous =
    cachedCapsules?.address.toLowerCase() === address.toLowerCase()
      ? cachedCapsules.items
      : readPersistedCapsules(address);

  let shells: CapsuleItem[] = [];
  try {
    shells = await loadShellsFromChain(address);
  } catch (error) {
    console.warn("[PublicOnchainCapsules] failed to load mint logs", error);
    return previous;
  }

  const mergedShells = mergeCapsuleItems(previous, shells);
  if (generation === cacheGeneration) {
    commitCapsuleCache(address, mergedShells);
  }

  const hydration = hydrateCapsulesInBackground(
    address,
    mergedShells,
    chainNowSec,
    options?.hydrateOpenedLimit,
  ).catch((error) => {
    console.warn("[PublicOnchainCapsules] background hydration failed", error);
  });

  inFlightHydration = hydration.then(() => undefined);
  return cachedCapsules?.items ?? mergedShells;
}

export async function loadPublicOnchainCapsuleById(
  tokenId: bigint,
): Promise<CapsuleItem | null> {
  const address = getRitualCapsuleAddress();
  if (!address) return null;

  const idStr = tokenId.toString();
  const existing = getCachedPublicOnchainCapsules().find(
    (c) => c.id === `onchain-${idStr}`,
  );

  try {
    const base =
      existing ??
      ({
        id: `onchain-${idStr}`,
        message: "",
        tag: "Personal" as const,
        userPhoto: "",
      } satisfies CapsuleItem);

    const item = await hydrateCapsuleMetadata(
      address,
      base,
      getCachedPublicOnchainCapsules(),
    );
    const current = getCachedPublicOnchainCapsules();
    commitCapsuleCache(address, mergeCapsuleItems(current, [item]));
    return item;
  } catch (error) {
    console.warn("[PublicOnchainCapsules] failed direct tokenURI read", {
      tokenId: idStr,
      error,
    });
    return existing ?? null;
  }
}

export type LoadPublicOnchainCapsulesOptions = {
  /** Unix seconds — opened capsules hydrated first. Default: local clock. */
  chainNowSec?: number;
  /** Hydrate opened capsules first (N = Home preview count; omit = all opened). */
  hydrateOpenedLimit?: number;
  /** When true, always wait for a fresh log scan (still returns stale cache first if any). */
  forceRefresh?: boolean;
};

/**
 * Fast public capsule list: returns cached / persisted data immediately when possible,
 * scans mint logs in bounded chunks, then hydrates tokenURI metadata in the background.
 */
export async function loadPublicOnchainCapsules(
  options: LoadPublicOnchainCapsulesOptions = {},
): Promise<CapsuleItem[]> {
  const address = getRitualCapsuleAddress();
  if (!address) return [];

  const chainNowSec =
    options.chainNowSec ?? Math.floor(Date.now() / 1000);
  const stale =
    getCachedPublicOnchainCapsules().length > 0
      ? getCachedPublicOnchainCapsules()
      : readPersistedCapsules(address);

  const cacheFresh =
    cachedCapsules &&
    cachedCapsules.address.toLowerCase() === address.toLowerCase() &&
    Date.now() - cachedCapsules.loadedAtMs <= PUBLIC_CAPSULE_FRESH_TTL_MS;

  if (stale.length > 0 && cacheFresh && !options.forceRefresh) {
    if (!inFlightCapsules) {
      const generation = cacheGeneration;
      inFlightCapsules = loadPublicOnchainCapsulesFresh(chainNowSec, {
        hydrateOpenedLimit: options.hydrateOpenedLimit,
      })
        .then((items) => (items.length > 0 ? items : stale))
        .catch((error) => {
          console.warn(
            "[PublicOnchainCapsules] background refresh failed",
            error,
          );
          return stale;
        })
        .finally(() => {
          if (generation === cacheGeneration) {
            inFlightCapsules = null;
          }
        });
    }
    return stale;
  }

  if (stale.length > 0 && !options.forceRefresh && !inFlightCapsules) {
    const generation = cacheGeneration;
    inFlightCapsules = loadPublicOnchainCapsulesFresh(chainNowSec, {
      hydrateOpenedLimit: options.hydrateOpenedLimit,
    })
      .then((items) => (items.length > 0 ? items : stale))
      .catch((error) => {
        console.warn("[PublicOnchainCapsules] background refresh failed", error);
        return stale;
      })
      .finally(() => {
        if (generation === cacheGeneration) {
          inFlightCapsules = null;
        }
      });
    return stale;
  }

  if (inFlightCapsules) {
    return inFlightCapsules;
  }

  const generation = cacheGeneration;
  inFlightCapsules = loadPublicOnchainCapsulesFresh(chainNowSec, {
    hydrateOpenedLimit: options.hydrateOpenedLimit,
  })
    .then((items) => {
      if (items.length > 0) return items;
      return stale.length > 0 ? stale : items;
    })
    .catch((error) => {
      console.warn("[PublicOnchainCapsules] load failed", error);
      return stale;
    })
    .finally(() => {
      if (generation === cacheGeneration) {
        inFlightCapsules = null;
      }
    });

  return inFlightCapsules;
}

/** Warm cache on app start (non-blocking). */
export function preloadPublicOnchainCapsules(
  chainNowSec = Math.floor(Date.now() / 1000),
): void {
  void loadPublicOnchainCapsules({ chainNowSec });
}

/** Optimistic insert after mint (merged when mint logs arrive). */
export function upsertPublicOnchainCapsule(item: CapsuleItem): void {
  const address = getRitualCapsuleAddress();
  if (!address) return;
  const current = getCachedPublicOnchainCapsules();
  commitCapsuleCache(address, mergeCapsuleItems(current, [item]));
}

/** Marks cache stale and triggers background refresh without wiping stored capsules. */
export function clearPublicOnchainCapsulesCache(): void {
  if (cachedCapsules) {
    cachedCapsules = {
      ...cachedCapsules,
      loadedAtMs: 0,
    };
  }
  void loadPublicOnchainCapsules({ forceRefresh: true });
}
