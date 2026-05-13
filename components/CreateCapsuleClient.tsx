"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAccount,
  useConnect,
  useConnectors,
  usePublicClient,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWalletClient,
  useWriteContract,
} from "wagmi";
import {
  CATEGORY_VISUAL,
  type CapsuleTag,
} from "@/lib/capsule-categories";
import { ritualTestnet } from "@/lib/chain";
import { normalizeBlockTimestampToSeconds } from "@/lib/chain-time";
import { formatContractCallError } from "@/lib/contract-call-error";
import {
  buildCapsuleTokenUri,
  bytecodeLooksLikeRitualTimeCapsuleRepo,
  getCapsuleContractEnv,
  RITUAL_CAPSULE_ABI,
} from "@/lib/ritual-time-capsule-contract";
import {
  isConnectorAlreadyConnectedError,
  readConnectedAddress,
} from "@/lib/wallet-connection";
import { useChainTime } from "@/components/web3-provider";
import { CAPSULE_QUERIES } from "@/lib/capsule-query-keys";
import { appendMintedCapsule } from "@/lib/minted-capsules-storage";
import type { CapsuleItem } from "@/lib/capsule-types";
import type { Address } from "viem";

const PRESETS = [
  { id: "7d", label: "7 Days (Quick)", seconds: 7 * 86400 },
  { id: "30d", label: "30 Days (Short)", seconds: 30 * 86400 },
  { id: "90d", label: "90 Days (Medium)", seconds: 90 * 86400 },
  { id: "1y", label: "1 Year (Long)", seconds: 365 * 86400 },
] as const;

type PresetId = (typeof PRESETS)[number]["id"] | "custom";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ONCHAIN_PHOTO_MAX_DIMENSION = 800;
const ONCHAIN_PHOTO_QUALITY = 0.75;
const ONCHAIN_PHOTO_MAX_DATA_URI_BYTES = 32 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const TAGS: CapsuleTag[] = [
  "Meme",
  "Work",
  "Personal",
  "Important",
  "Dream",
  "Nature",
];

function capsuleCacheKey(item: CapsuleItem): string {
  return [
    item.owner?.toLowerCase() ?? "",
    item.unlockAtUnix == null ? "" : Math.floor(item.unlockAtUnix).toString(),
    item.message.trim(),
    item.tag,
  ].join("|");
}

function prependUniqueCapsule(
  current: CapsuleItem[] = [],
  item: CapsuleItem,
): CapsuleItem[] {
  const key = capsuleCacheKey(item);
  return [
    item,
    ...current.filter(
      (currentItem) =>
        currentItem.id !== item.id && capsuleCacheKey(currentItem) !== key,
    ),
  ];
}

function toDatetimeLocalMin(sec: number) {
  const d = new Date(sec * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function canvasToJpegDataUrl(
  source: HTMLImageElement,
  maxDimension: number,
): Promise<string> {
  const scale = Math.min(
    1,
    maxDimension / Math.max(source.naturalWidth, source.naturalHeight),
  );
  const width = Math.max(1, Math.round(source.naturalWidth * scale));
  const height = Math.max(1, Math.round(source.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve("");

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob(
      async (blob) => {
        resolve(blob ? await blobToDataUrl(blob) : "");
      },
      "image/jpeg",
      ONCHAIN_PHOTO_QUALITY,
    );
  });
}

async function optimizePhotoForOnchain(photoUrl: string | null): Promise<string> {
  if (!photoUrl) return "";

  try {
    const sourceBlob = await fetch(photoUrl).then((r) => r.blob());
    const objectUrl = URL.createObjectURL(sourceBlob);
    const img = new window.Image();
    img.decoding = "async";
    img.src = objectUrl;
    await img.decode();

    let maxDimension = ONCHAIN_PHOTO_MAX_DIMENSION;
    let optimized = "";
    while (maxDimension >= 160) {
      optimized = await canvasToJpegDataUrl(img, maxDimension);
      if (
        optimized &&
        new Blob([optimized]).size <= ONCHAIN_PHOTO_MAX_DATA_URI_BYTES
      ) {
        break;
      }
      maxDimension = Math.floor(maxDimension * 0.82);
    }

    URL.revokeObjectURL(objectUrl);
    return optimized;
  } catch {
    return "";
  }
}

/** Рендерить children лише після mount (уникає hydration mismatch). */
function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);
  if (!mounted) return null;
  return <>{children}</>;
}

export function CreateCapsuleClient() {
  const [clientMounted, setClientMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setClientMounted(true));
  }, []);

  const { nowSec, ready } = useChainTime();
  const { address, chainId, isConnected } = useAccount();
  const connectors = useConnectors();
  const { connectAsync, isPending: isConnecting } = useConnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { error: writeError, reset: resetWrite } = useWriteContract();

  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [txSubmitting, setTxSubmitting] = useState(false);
  const { data: receipt, isLoading: isConfirming } =
    useWaitForTransactionReceipt({
      hash: txHash,
    });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoDragOver, setPhotoDragOver] = useState(false);
  const [tag, setTag] = useState<CapsuleTag>("Personal");
  const [preset, setPreset] = useState<PresetId>("30d");
  const [customLocal, setCustomLocal] = useState("");

  const [pastUnlockOpen, setPastUnlockOpen] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const mintInFlightRef = useRef(false);
  const pendingMintToRef = useRef<Address | null>(null);
  /** Unlock time, фактично відправлений у mint (після підгонки під block.timestamp контракту). */
  const pendingUnlockSentRef = useRef<number | null>(null);
  /** Optimized data URI used only in memory until public on-chain metadata refetches. */
  const pendingOnchainPhotoRef = useRef<string>("");

  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient({ chainId: ritualTestnet.id });

  const unlockAtUnix = useMemo(() => {
    const chainNow = normalizeBlockTimestampToSeconds(nowSec);
    if (!ready || chainNow <= 0) return 0;
    if (preset === "custom") {
      if (!customLocal) return chainNow + 30 * 86400;
      const u = Math.floor(new Date(customLocal).getTime() / 1000);
      return Number.isFinite(u)
        ? normalizeBlockTimestampToSeconds(u)
        : chainNow + 30 * 86400;
    }
    const p = PRESETS.find((x) => x.id === preset);
    return chainNow + (p?.seconds ?? 30 * 86400);
  }, [customLocal, nowSec, preset, ready]);

  const contractEnv = useMemo(() => getCapsuleContractEnv(), []);
  const capsuleAddress =
    contractEnv.status === "ok" ? contractEnv.address : null;

  const walletConnector =
    connectors.find((c) => c.id === "metaMaskSDK") ??
    connectors.find((c) => c.id === "metaMask") ??
    connectors[0];

  const mintSucceeded = Boolean(txHash && receipt?.status === "success");
  const mintReverted = Boolean(txHash && receipt?.status === "reverted");
  const displayMintError =
    mintReverted
      ? "Transaction reverted on-chain."
      : (mintError ?? writeError?.message ?? null);

  const queryClient = useQueryClient();
  const savedMintTxRef = useRef<string | null>(null);
  const capsuleTag: CapsuleTag = tag === "Time" ? "Personal" : tag;
  const chainNowSec = normalizeBlockTimestampToSeconds(nowSec);

  useEffect(() => {
    if (receipt?.status === "success" || receipt?.status === "reverted") {
      mintInFlightRef.current = false;
      queueMicrotask(() => setTxSubmitting(false));
    }
  }, [receipt?.status]);

  useEffect(() => {
    if (
      !mintSucceeded ||
      receipt?.status !== "success" ||
      !txHash ||
      !address
    ) {
      return;
    }
    if (savedMintTxRef.current === txHash) return;
    savedMintTxRef.current = txHash;

    let cancelled = false;
    (async () => {
      try {
        if (cancelled) return;
        const owner = address.toLowerCase();
        const unlockAt =
          pendingUnlockSentRef.current != null
            ? pendingUnlockSentRef.current
            : unlockAtUnix;
        const onchainPhoto = pendingOnchainPhotoRef.current;
        const optimisticCapsule: CapsuleItem = {
          id: txHash,
          owner,
          unlockAtUnix: unlockAt,
          message: message.trim(),
          tag: capsuleTag,
          userPhoto: onchainPhoto,
        };

        appendMintedCapsule({
          id: optimisticCapsule.id,
          owner,
          unlockAtUnix: unlockAt,
          message: optimisticCapsule.message,
          tag: optimisticCapsule.tag,
          userPhoto: "",
        });

        queryClient.setQueryData<CapsuleItem[]>(
          CAPSULE_QUERIES.user(address),
          (current = []) => prependUniqueCapsule(current, optimisticCapsule),
        );

        if (unlockAt <= chainNowSec) {
          queryClient.setQueryData<CapsuleItem[]>(
            CAPSULE_QUERIES.gallery(),
            (current = []) => prependUniqueCapsule(current, optimisticCapsule),
          );
          queryClient.setQueryData<CapsuleItem[]>(
            CAPSULE_QUERIES.homeRecentlyOpenedRoot,
            (current = []) =>
              prependUniqueCapsule(current, optimisticCapsule).slice(0, 3),
          );
        }

        const refreshCapsuleQueries = async () => {
          console.debug("[CreateCapsule] refreshing capsule queries", {
            txHash,
            unlockAt,
            chainNowSec,
            isOpenedNow: unlockAt <= chainNowSec,
          });

          await Promise.all([
            queryClient.removeQueries({
              queryKey: CAPSULE_QUERIES.gallery(),
              type: "inactive",
            }),
            queryClient.removeQueries({
              queryKey: CAPSULE_QUERIES.homeRecentlyOpenedRoot,
              type: "inactive",
            }),
            queryClient.invalidateQueries({
              queryKey: CAPSULE_QUERIES.root,
              refetchType: "all",
            }),
          ]);

          await Promise.all([
            queryClient.refetchQueries({
              queryKey: CAPSULE_QUERIES.user(address),
              type: "all",
            }),
            queryClient.refetchQueries({
              queryKey: CAPSULE_QUERIES.gallery(),
              type: "all",
            }),
            queryClient.refetchQueries({
              queryKey: CAPSULE_QUERIES.homeRecentlyOpenedRoot,
              type: "all",
            }),
          ]);
        };

        await refreshCapsuleQueries();
        window.setTimeout(() => {
          void refreshCapsuleQueries();
        }, 3000);
        window.setTimeout(() => {
          void refreshCapsuleQueries();
        }, 15000);
      } catch (e) {
        console.error(e);
      } finally {
        pendingOnchainPhotoRef.current = "";
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    address,
    chainNowSec,
    message,
    mintSucceeded,
    photoUrl,
    queryClient,
    receipt?.status,
    capsuleTag,
    txHash,
    unlockAtUnix,
  ]);

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) return;
    const type = file.type.toLowerCase();
    if (type && !ACCEPTED_IMAGE_TYPES.has(type)) return;
    const url = URL.createObjectURL(file);
    setPhotoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }

  const minCustom =
    ready && chainNowSec > 0 ? toDatetimeLocalMin(chainNowSec + 60) : "";

  const tagVisual = CATEGORY_VISUAL[capsuleTag];

  const isMinting =
    txSubmitting || (!!txHash && isConfirming);

  const runMint = useCallback(
    async (to: Address) => {
      setMintError(null);
      resetWrite();

      if (!capsuleAddress) {
        setMintError(
          contractEnv.status === "invalid"
            ? `Invalid capsule contract address: ${contractEnv.detail}`
            : "Capsule contract address is missing.",
        );
        return;
      }
      const trimmed = message.trim();
      if (!trimmed) {
        setMintError("Please write a message for your capsule.");
        return;
      }
      if (!ready || unlockAtUnix <= 0) {
        setMintError("Chain time is still loading. Try again in a moment.");
        return;
      }

      if (!publicClient) {
        setMintError("Немає з'єднання з RPC. Перезавантажте сторінку.");
        return;
      }
      if (!walletClient) {
        setMintError(
          "Гаманець не готовий. Підключіть MetaMask і мережу Ritual Testnet (1979).",
        );
        return;
      }

      const account = walletClient.account;
      if (!account) {
        setMintError(
          "MetaMask не надав активний акаунт. Розблокуйте гаманець і спробуйте знову.",
        );
        return;
      }

      if (account.address.toLowerCase() !== to.toLowerCase()) {
        setMintError(
          "Адреса в додатку не збігається з активним акаунтом у MetaMask. Підтвердіть мережу Ritual (1979) і спробуйте ще раз.",
        );
        return;
      }

      if (mintInFlightRef.current) {
        setMintError("Mint transaction is already pending. Wait for confirmation.");
        return;
      }
      mintInFlightRef.current = true;
      setTxHash(undefined);
      setTxSubmitting(true);
      let submittedHash: `0x${string}` | undefined;
      try {
        const latest = await publicClient.getBlock({ blockTag: "latest" });
        const rawBlockTs = BigInt(latest.timestamp);
        /**
         * Ritual RPC повертає `block.timestamp` у мілісекундах (значення > 1e12).
         * Контракт порівнює unlockTimestamp з `block.timestamp` у тих самих одиницях —
         * якщо передати «секунди», умова unlock > block ламається і буде InvalidUnlockDate.
         */
        const chainClockMs = rawBlockTs > BigInt(1e12);
        const unlockSec = BigInt(normalizeBlockTimestampToSeconds(unlockAtUnix));
        let unlockArg: bigint;
        if (chainClockMs) {
          const msPerSec = BigInt(1000);
          const marginMs = BigInt(60_000);
          unlockArg = unlockSec * msPerSec;
          if (unlockArg <= rawBlockTs) {
            unlockArg = rawBlockTs + marginMs;
          }
          pendingUnlockSentRef.current = Number(unlockArg / msPerSec);
        } else {
          const blockTs = BigInt(
            normalizeBlockTimestampToSeconds(Number(rawBlockTs)),
          );
          unlockArg = unlockSec;
          if (unlockArg <= blockTs) {
            unlockArg = blockTs + BigInt(60);
          }
          pendingUnlockSentRef.current = Number(unlockArg);
        }

        const bytecode = await publicClient.getBytecode({
          address: capsuleAddress,
        });
        if (!bytecode || bytecode === "0x") {
          pendingUnlockSentRef.current = null;
          setMintError(
            `За адресою ${capsuleAddress} немає контракту. Перевірте .env.local і деплой на Ritual.`,
          );
          return;
        }
        if (!bytecodeLooksLikeRitualTimeCapsuleRepo(bytecode)) {
          pendingUnlockSentRef.current = null;
          setMintError(
            `Адреса ${capsuleAddress} — не збірка RitualTimeCapsule з каталогу contracts/ (у bytecode немає mintCapsule). Задеплойте з папки contracts: npx hardhat run scripts/deploy.js --network ritual (потрібен PRIVATE_KEY у .env), пропишіть нову адресу в NEXT_PUBLIC_RITUAL_CAPSULE_ADDRESS і перезапустіть npm run dev.`,
          );
          return;
        }

        try {
          const normalizedBlockTs =
            rawBlockTs > BigInt(1_000_000_000_000)
              ? rawBlockTs / BigInt(1000)
              : rawBlockTs;
          const today = normalizedBlockTs / BigInt(86400);
          const [dailyLimit, mintedCount, lastMintDay] = await Promise.all([
            publicClient.readContract({
              address: capsuleAddress,
              abi: RITUAL_CAPSULE_ABI,
              functionName: "DAILY_LIMIT",
            }),
            publicClient.readContract({
              address: capsuleAddress,
              abi: RITUAL_CAPSULE_ABI,
              functionName: "dailyMints",
              args: [account.address],
            }),
            publicClient.readContract({
              address: capsuleAddress,
              abi: RITUAL_CAPSULE_ABI,
              functionName: "lastMintDay",
              args: [account.address],
            }),
          ]);
          const mintedToday =
            lastMintDay === today ? mintedCount : BigInt(0);

          console.debug("[CreateCapsule] daily mint limit", {
            today: today.toString(),
            lastMintDay: lastMintDay.toString(),
            mintedToday: mintedToday.toString(),
            dailyLimit: dailyLimit.toString(),
          });

          if (mintedToday >= dailyLimit) {
            pendingUnlockSentRef.current = null;
            setMintError(
              "Daily mint limit reached (3 capsules per day). Limit resets tomorrow.",
            );
            return;
          }
        } catch (limitError) {
          console.warn("[CreateCapsule] daily limit precheck failed", limitError);
        }

        const onchainPhoto = await optimizePhotoForOnchain(photoUrl);
        pendingOnchainPhotoRef.current = onchainPhoto;
        const tokenURI = buildCapsuleTokenUri(trimmed, capsuleTag, onchainPhoto);

        await publicClient.simulateContract({
          address: capsuleAddress,
          abi: RITUAL_CAPSULE_ABI,
          functionName: "mintCapsule",
          args: [to, unlockArg, tokenURI],
          account,
          chain: ritualTestnet,
        });

        const hash = await walletClient.writeContract({
          address: capsuleAddress,
          abi: RITUAL_CAPSULE_ABI,
          functionName: "mintCapsule",
          args: [to, unlockArg, tokenURI],
          account,
          chain: ritualTestnet,
        });
        submittedHash = hash;
        setTxHash(hash);
      } catch (e) {
        pendingUnlockSentRef.current = null;
        setMintError(formatContractCallError(e));
      } finally {
        if (!submittedHash) {
          pendingOnchainPhotoRef.current = "";
          mintInFlightRef.current = false;
          setTxSubmitting(false);
        }
      }
    },
    [
      capsuleAddress,
      capsuleTag,
      contractEnv,
      message,
      photoUrl,
      publicClient,
      ready,
      resetWrite,
      unlockAtUnix,
      walletClient,
    ],
  );

  async function resolveMintRecipient(): Promise<Address | null> {
    setMintError(null);
    if (!walletConnector) {
      setMintError(
        "No wallet connector. Reload the page or install MetaMask.",
      );
      return null;
    }
    try {
      if (isConnected && address) {
        if (chainId !== ritualTestnet.id) {
          await switchChainAsync({ chainId: ritualTestnet.id });
        }
        return address;
      }

      try {
        const r = await connectAsync({
          connector: walletConnector,
        });
        if (r.chainId !== ritualTestnet.id) {
          await switchChainAsync({ chainId: ritualTestnet.id });
        }
        return r.accounts[0];
      } catch (e) {
        if (!isConnectorAlreadyConnectedError(e)) {
          throw e;
        }
        await switchChainAsync({ chainId: ritualTestnet.id });
        const to = readConnectedAddress();
        if (!to) {
          setMintError(
            "Wallet reports connected but no address is available. Try refreshing the page.",
          );
          return null;
        }
        return to;
      }
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Wallet request failed.";
      setMintError(msg);
      console.error(e);
      return null;
    }
  }

  async function handleSealClick() {
    if (mintSucceeded || isMinting || isConnecting || isSwitching) return;

    const to = await resolveMintRecipient();
    if (!to) return;

    if (unlockAtUnix <= chainNowSec) {
      pendingMintToRef.current = to;
      setPastUnlockOpen(true);
      return;
    }
    await runMint(to);
  }

  async function handleConfirmPastMint() {
    const to = pendingMintToRef.current ?? address;
    if (!to) {
      setMintError("Wallet address missing. Try again.");
      setPastUnlockOpen(false);
      return;
    }
    setPastUnlockOpen(false);
    pendingMintToRef.current = null;
    await runMint(to);
  }

  function handleCreateAnother() {
    savedMintTxRef.current = null;
    pendingUnlockSentRef.current = null;
    mintInFlightRef.current = false;
    setTxHash(undefined);
    setMintError(null);
    resetWrite();
    setPastUnlockOpen(false);
    pendingMintToRef.current = null;
    setMessage("");
    setPhotoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreset("30d");
    setCustomLocal("");
    setTag("Personal");
  }

  if (mintSucceeded) {
    return (
      <div
        className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:space-y-10 sm:py-10 md:px-6"
        suppressHydrationWarning
      >
        <section className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-b from-purple-950/40 via-black/50 to-cyan-950/25 px-5 py-12 text-center sm:px-6 sm:py-16">
          <div className="relative mx-auto h-56 w-56 sm:h-64 sm:w-64">
            <Image
              src="/assets/capsule-closed.png"
              alt="Sealed capsule"
              fill
              className="object-contain animate-capsule-seal"
              sizes="256px"
              priority
            />
          </div>
          <p className="mt-8 max-w-md text-lg font-medium leading-relaxed text-white sm:text-xl">
            Your capsule has been successfully sealed in time!
          </p>
          {txHash ? (
            <a
              href={`${ritualTestnet.blockExplorers.default.url}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 text-sm text-cyan-400/90 underline-offset-4 hover:underline"
            >
              View transaction
            </a>
          ) : null}
          <div className="mt-8 flex w-full max-w-sm flex-col items-stretch gap-3 sm:mt-10 sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-center sm:gap-3">
            <Link
              href="/my-capsules"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-gradient-to-r from-purple-600/90 to-cyan-600/85 px-8 py-3.5 text-base font-medium text-white shadow-[0_0_28px_-6px_rgba(168,85,247,0.7)] transition hover:brightness-110 sm:min-h-0 sm:py-3 sm:text-sm"
            >
              View My Capsules
            </Link>
            <button
              type="button"
              onClick={handleCreateAnother}
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 bg-white/5 px-8 py-3.5 text-base font-medium text-zinc-200 transition hover:border-cyan-400/40 hover:bg-white/10 sm:min-h-0 sm:py-3 sm:text-sm"
            >
              Create Another
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:space-y-10 sm:py-10 md:px-6"
      suppressHydrationWarning
    >
      {pastUnlockOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="past-unlock-title"
        >
          <div className="max-w-md rounded-2xl border border-amber-500/25 bg-zinc-950/95 p-6 shadow-[0_0_48px_-8px_rgba(251,191,36,0.35)]">
            <h2
              id="past-unlock-title"
              className="text-lg font-semibold text-amber-100"
            >
              Unlock time in the past
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              This time has already passed. Your capsule will be automatically
              opened upon minting.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  pendingMintToRef.current = null;
                  setPastUnlockOpen(false);
                }}
                disabled={isMinting}
                className="min-h-11 rounded-full border border-white/15 px-4 py-2.5 text-sm text-zinc-300 transition hover:bg-white/5 disabled:opacity-50 sm:min-h-0 sm:py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPastMint}
                disabled={isMinting}
                className="min-h-11 rounded-full bg-gradient-to-r from-amber-600/90 to-orange-600/85 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-amber-900/30 transition hover:brightness-110 disabled:opacity-60 sm:min-h-0 sm:py-2"
              >
                {isMinting ? "Minting…" : "Confirm Mint (Opened)"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-black/40 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-white md:text-xl">
          Live preview
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          <span className="md:hidden">
            Top: sealed capsule. Below: your open capsule — photo, message, and
            category badge, matching the home grid.
          </span>
          <span className="hidden md:inline">
            Left: sealed capsule. Right: your open capsule — photo, message, and
            category badge (top right), as on the home grid.
          </span>
        </p>
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-6">
          <div className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-xl border border-white/10 bg-black/60 md:mx-0 md:max-h-[22rem] md:max-w-none">
            <Image
              src="/assets/capsule-closed.png"
              alt="Sealed capsule"
              fill
              className="object-contain p-5 sm:p-6"
              sizes="(max-width: 768px) 100vw, 360px"
            />
          </div>
          <div className="relative flex w-full flex-col gap-3 md:max-h-[22rem]">
            <span
              className={`pointer-events-none absolute right-2 top-2 z-10 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg shadow-black/50 sm:py-1 ${tagVisual.badge}`}
            >
              {capsuleTag}
            </span>
            <div
              className={`relative min-h-[14rem] flex-1 overflow-hidden rounded-xl ring-2 ring-offset-2 ring-offset-black sm:min-h-[12rem] md:min-h-0 ${photoUrl ? tagVisual.glow : "ring-zinc-600/45 shadow-none"}`}
            >
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl}
                  alt="Your photo"
                  className="h-full min-h-[14rem] w-full bg-black/55 object-contain sm:min-h-[12rem]"
                />
              ) : (
                <div className="flex h-full min-h-[14rem] items-center justify-center bg-black/40 px-4 text-center text-sm text-zinc-500 sm:min-h-[12rem]">
                  Upload a photo — it will appear here
                </div>
              )}
            </div>
            <p className="rounded-xl border border-white/10 bg-black/40 p-3.5 text-sm leading-relaxed text-zinc-300 sm:p-3 md:text-sm">
              {message.trim() ||
                "Your message will show here when the capsule opens."}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-8 md:grid-cols-2 md:gap-10">
        <div className="space-y-5 md:space-y-6">
          <h2 className="text-lg font-semibold text-white md:text-xl">
            New capsule
          </h2>

          <label className="block space-y-2 text-sm text-zinc-300">
            <span>Category</span>
            <select
              value={capsuleTag}
              onChange={(e) => setTag(e.target.value as CapsuleTag)}
              className="min-h-12 w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-base text-zinc-100 outline-none focus:border-cyan-500/40 md:min-h-0 md:py-2.5 md:text-sm"
            >
              {TAGS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-2 text-sm text-zinc-300">
            <span>Photo</span>
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`cursor-pointer rounded-xl border border-dashed p-6 text-center transition hover:border-white/50 sm:p-8 ${
                photoDragOver
                  ? "border-cyan-400"
                  : "border-white/30"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setPhotoDragOver(true);
              }}
              onDragLeave={() => setPhotoDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setPhotoDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-xl">
                📸
              </div>
              <p className="font-medium text-white">
                Drag &amp; drop your photo here
              </p>
              <p className="mt-1 text-sm text-zinc-500">or click to browse</p>
              <p className="mt-3 text-xs text-zinc-600">
                PNG, JPG, WEBP up to 10MB
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] p-3 text-xs leading-relaxed text-cyan-100/85">
              <span className="font-semibold text-cyan-100">
                Privacy note:
              </span>{" "}
              Your photo is converted to on-chain metadata in your browser and
              never stored on our servers. It is sent only as optimized NFT
              tokenURI data, so opened capsules can be visible to everyone.
            </div>
          </div>

          <label className="block space-y-2 text-sm text-zinc-300">
            <span>Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={500}
              className="w-full resize-none rounded-xl border border-purple-500/25 bg-black/45 px-4 py-3.5 text-base leading-relaxed text-zinc-100 outline-none focus:border-cyan-400/40 md:py-3 md:text-sm"
              placeholder="Write your message…"
            />
            <span className="text-right text-xs text-zinc-500">
              {message.length} / 500
            </span>
          </label>
        </div>

        <div className="space-y-5 md:space-y-6">
          <h2 className="text-lg font-semibold text-white md:text-xl">
            Unlock time
          </h2>
          <p className="text-sm leading-relaxed text-zinc-400">
            Unlock timestamp uses the Ritual network clock (latest block time).
            {clientMounted && !ready ? " Loading chain time…" : null}
          </p>

          <div className="flex flex-wrap gap-2 sm:gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={`min-h-11 rounded-full px-4 py-2.5 text-sm font-medium transition md:min-h-0 md:px-3 md:py-1.5 md:text-xs ${
                  preset === p.id
                    ? "bg-purple-500/30 text-white ring-1 ring-cyan-400/40"
                    : "bg-white/5 text-zinc-400 hover:bg-white/10"
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPreset("custom")}
              className={`min-h-11 rounded-full px-4 py-2.5 text-sm font-medium transition md:min-h-0 md:px-3 md:py-1.5 md:text-xs ${
                preset === "custom"
                  ? "bg-purple-500/30 text-white ring-1 ring-cyan-400/40"
                  : "border border-cyan-500/40 bg-transparent text-cyan-200 hover:bg-cyan-500/10"
              }`}
            >
              Custom date
            </button>
          </div>

          {preset === "custom" ? (
            <label className="block space-y-2 text-sm text-zinc-300">
              <span>Pick date &amp; time</span>
              <input
                type="datetime-local"
                min={clientMounted ? minCustom : undefined}
                value={customLocal}
                onChange={(e) => setCustomLocal(e.target.value)}
                className="min-h-12 w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-base text-zinc-100 outline-none focus:border-cyan-500/40 md:min-h-0 md:py-2.5 md:text-sm"
              />
            </label>
          ) : null}

          <div className="rounded-xl border border-white/10 bg-black/35 p-4 text-sm text-zinc-400">
            <span className="text-zinc-500">Unlock at (Unix): </span>
            <span className="font-mono text-zinc-200">
              {clientMounted && ready ? unlockAtUnix : "—"}
            </span>
          </div>

          <ClientOnly>
            {contractEnv.status === "unset" ? (
              <div
                role="alert"
                className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-100/95"
              >
                <p className="font-semibold text-amber-200">
                  Contract address is not configured
                </p>
                <p className="mt-2 text-amber-100/85">
                  У корені проєкту в{" "}
                  <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">
                    .env.local
                  </span>{" "}
                  вкажіть{" "}
                  <span className="font-mono text-xs break-all">
                    NEXT_PUBLIC_RITUAL_CAPSULE_ADDRESS=0x…
                  </span>{" "}
                  — адресу вашого деплою{" "}
                  <span className="font-mono text-xs">RitualTimeCapsule</span> з{" "}
                  <span className="font-mono text-xs">contracts/</span>, потім
                  перезапустіть <span className="font-mono text-xs">npm run dev</span>.
                </p>
              </div>
            ) : null}

            {contractEnv.status === "invalid" ? (
              <div
                role="alert"
                className="rounded-xl border border-red-500/40 bg-red-950/35 p-4 text-sm text-red-100/95"
              >
                <p className="font-semibold text-red-200">
                  Invalid contract address in environment
                </p>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-red-100/85">
                  <li>
                    Open{" "}
                    <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">
                      .env.local
                    </span>{" "}
                    in the project root.
                  </li>
                  <li>
                    Set a valid address (must be{" "}
                    <span className="font-medium text-red-50">0x + 40 hex</span>
                    ), for example:{" "}
                    <span className="font-mono text-xs break-all">
                      NEXT_PUBLIC_RITUAL_CAPSULE_ADDRESS=0x…
                    </span>{" "}
                    (recommended) or legacy{" "}
                    <span className="font-mono text-xs break-all">
                      NEXT_PUBLIC_RITUAL_TIME_CAPSULE_ADDRESS=0x…
                    </span>
                    .
                  </li>
                  <li>
                    Save the file and{" "}
                    <span className="font-medium text-red-50">restart</span>{" "}
                    <span className="font-mono text-xs">npm run dev</span> — Next.js
                    reads <span className="font-mono text-xs">NEXT_PUBLIC_*</span>{" "}
                    at startup.
                  </li>
                </ol>
                <p className="mt-3 text-xs text-red-200/90">
                  {contractEnv.detail}
                </p>
              </div>
            ) : null}

            {displayMintError ? (
              <p className="text-sm text-red-400/90">{displayMintError}</p>
            ) : null}
          </ClientOnly>

          <button
            type="button"
            onClick={handleSealClick}
            disabled={
              !clientMounted ||
              !ready ||
              !capsuleAddress ||
              !message.trim() ||
              isMinting ||
              isConnecting ||
              isSwitching
            }
            className="relative min-h-[3.25rem] w-full overflow-hidden rounded-full bg-gradient-to-r from-purple-600/90 to-cyan-600/85 py-3.5 text-base font-medium text-white shadow-[0_0_28px_-6px_rgba(168,85,247,0.7)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0 md:py-3 md:text-sm"
          >
            {isMinting || isConnecting || isSwitching ? (
              <span className="inline-flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                {isConnecting
                  ? "Connecting…"
                  : isSwitching
                    ? "Switching network…"
                    : txSubmitting
                      ? "Confirm in wallet…"
                      : "Sealing on-chain…"}
              </span>
            ) : (
              "Seal Capsule"
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
