"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { CATEGORY_VISUAL } from "@/lib/capsule-categories";
import type { CapsuleItem } from "@/lib/capsule-types";
import { normalizeBlockTimestampToSeconds } from "@/lib/chain-time";
import { formatOpenedAgo, formatSealedUntil } from "@/lib/time-format";
import { useChainTime } from "@/components/web3-provider";

const MESSAGE_MIN =
  "min-h-[3.5rem] sm:min-h-[4rem] md:min-h-[4.25rem]";
const CARD_MIN_H =
  "min-h-[26rem] sm:min-h-[28rem] md:min-h-[30rem]";

const PHOTO_SHELL_DEFAULT =
  "relative aspect-[4/3] min-h-[14rem] w-full shrink-0 overflow-hidden rounded-xl bg-black/55 sm:aspect-auto sm:h-56 sm:min-h-0 md:h-60 " +
  "ring-1 ring-inset ring-white/25 " +
  "transition-[box-shadow,ring-color] duration-300 ease-out " +
  "group-hover:ring-white/40 " +
  "group-hover:shadow-[0_0_32px_-8px_rgba(168,85,247,0.45),0_0_22px_-6px_rgba(34,211,238,0.28)]";

/** Taller photo + tighter radius for Home “spotlight” row. */
const PHOTO_SHELL_SPOTLIGHT =
  "relative aspect-[4/3] min-h-[14rem] w-full shrink-0 overflow-hidden rounded-[0.875rem] bg-black/55 sm:aspect-auto sm:h-[15.5rem] sm:min-h-0 md:h-64 " +
  "ring-1 ring-inset ring-white/28 " +
  "transition-[box-shadow,ring-color] duration-300 ease-out " +
  "group-hover:ring-white/45 " +
  "group-hover:shadow-[0_0_36px_-8px_rgba(168,85,247,0.5),0_0_24px_-6px_rgba(34,211,238,0.32)]";

function CategoryBadge({
  tag,
  spotlight,
}: {
  tag: CapsuleItem["tag"];
  spotlight?: boolean;
}) {
  const visual = CATEGORY_VISUAL[tag];
  const shadow = spotlight
    ? "shadow-[0_3px_20px_rgba(0,0,0,0.95),0_0_0_1px_rgba(0,0,0,0.4)]"
    : "shadow-[0_2px_14px_rgba(0,0,0,0.92)]";
  return (
    <span
      className={`pointer-events-none absolute right-2.5 top-2.5 z-20 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-tight tracking-wide backdrop-blur-sm sm:right-3 sm:top-3 sm:text-xs ${shadow} ${visual.badge}`}
    >
      {tag}
    </span>
  );
}

function PhotoBlock({
  children,
  spotlight,
}: {
  children: ReactNode;
  spotlight?: boolean;
}) {
  return (
    <div className={spotlight ? PHOTO_SHELL_SPOTLIGHT : PHOTO_SHELL_DEFAULT}>
      {children}
    </div>
  );
}

function normalizeOptionalUnixTime(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return normalizeBlockTimestampToSeconds(value);
}

export function CapsuleCard({
  item,
  forceOpened = false,
  hideShare = false,
  variant = "default",
  className = "",
}: {
  item: CapsuleItem;
  forceOpened?: boolean;
  hideShare?: boolean;
  /** `spotlight` — premium Home row: taller photo, gradient shell, time-only footer. */
  variant?: "default" | "spotlight";
  className?: string;
}) {
  const spotlight = variant === "spotlight";
  const { nowSec, ready } = useChainTime();
  const [shareStatus, setShareStatus] = useState<"" | "copied" | "failed">(
    "",
  );
  const photoSrc = item.userPhoto || "";

  const fallbackNow = Math.floor(Date.now() / 1000);
  const chainNow =
    ready && Number.isFinite(nowSec) && nowSec > 0
      ? normalizeBlockTimestampToSeconds(nowSec)
      : fallbackNow;
  const unlockRaw = normalizeOptionalUnixTime(item.unlockAtUnix);
  const unlockForSealed = unlockRaw ?? Number.MAX_SAFE_INTEGER;
  const hasUnlockTime = unlockRaw != null;
  const hasTimePassed = hasUnlockTime && unlockRaw <= chainNow;
  const isSealed =
    !forceOpened &&
    chainNow > 0 &&
    hasUnlockTime &&
    unlockForSealed > chainNow;
  const isOpenedVisual = forceOpened || hasTimePassed || !isSealed;

  useEffect(() => {
    console.debug("[CapsuleCard] open state", {
      id: item.id,
      owner: item.owner,
      nowSec,
      ready,
      chainNow,
      unlockAtUnix: unlockRaw,
      forceOpened,
      hasTimePassed,
      isSealed,
      isOpenedVisual,
      hasPhoto: Boolean(photoSrc),
      messageLength: item.message.length,
    });
  }, [
    chainNow,
    forceOpened,
    hasTimePassed,
    isOpenedVisual,
    isSealed,
    item.id,
    item.message.length,
    item.owner,
    nowSec,
    photoSrc,
    ready,
    unlockRaw,
  ]);

  const timeLabel = (() => {
    if (forceOpened) {
      const u = unlockRaw;
      if (u == null || !Number.isFinite(u)) {
        return "Opened recently";
      }
      const openedAt = Math.min(Math.floor(u), chainNow);
      return formatOpenedAgo(openedAt, chainNow);
    }
    if (isSealed) {
      return formatSealedUntil(unlockForSealed);
    }
    const u = unlockRaw ?? 0;
    const openedAt = u > 0 ? Math.min(Math.floor(u), chainNow) : chainNow;
    return formatOpenedAgo(openedAt, chainNow);
  })();

  const cardBase = spotlight
    ? `rounded-2xl border border-white/[0.1] bg-gradient-to-b from-zinc-950/95 to-black/[0.93] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-5`
    : `rounded-2xl border border-white/10 bg-black/60 p-4`;

  return (
    <div
      className={`group relative flex h-full ${CARD_MIN_H} flex-col overflow-hidden ${cardBase} transition-colors ${spotlight ? "hover:border-white/[0.14]" : "hover:border-white/18"} ${className}`}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {isSealed ? (
          <>
            <PhotoBlock spotlight={spotlight}>
              <CategoryBadge tag={item.tag} spotlight={spotlight} />
              <Image
                src="/assets/capsule-closed.png"
                alt="Sealed capsule"
                fill
                className="object-contain p-4 sm:p-5"
                sizes="(max-width: 768px) 100vw, 280px"
              />
            </PhotoBlock>
            <div className={`${MESSAGE_MIN} mt-3 flex-1`} aria-hidden />
          </>
        ) : isOpenedVisual ? (
          <>
            {photoSrc ? (
              <PhotoBlock key={photoSrc} spotlight={spotlight}>
                <CategoryBadge tag={item.tag} spotlight={spotlight} />
                {/* Dynamic blob/data images are more reliable as plain <img> on mobile. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={`opened-${item.id}-${photoSrc}`}
                  src={photoSrc}
                  alt="Capsule content"
                  className="capsule-opened-photo"
                  data-unoptimized="true"
                  loading="eager"
                  decoding="async"
                  sizes="(max-width: 480px) calc(100vw - 48px), (max-width: 768px) calc(100vw - 64px), 280px"
                />
              </PhotoBlock>
            ) : (
              <PhotoBlock spotlight={spotlight}>
                <CategoryBadge tag={item.tag} spotlight={spotlight} />
                <div className="flex h-full items-center justify-center bg-zinc-950/90 text-center text-xs text-zinc-500">
                  No photo
                </div>
              </PhotoBlock>
            )}
            <p
              className={`mt-3 line-clamp-4 flex-shrink-0 text-sm leading-relaxed sm:mt-4 ${spotlight ? "font-normal text-zinc-200/95" : "text-zinc-300"} ${MESSAGE_MIN}`}
            >
              {item.message || (
                <span className="text-zinc-600">No message</span>
              )}
            </p>
            <div className="min-h-[1px] flex-1" aria-hidden />
          </>
        ) : null}
      </div>

      <div
        className={`mt-auto flex shrink-0 items-end gap-2 border-t pt-3 sm:pt-4 ${spotlight ? "border-white/[0.08]" : "border-white/10"} ${isOpenedVisual && hideShare ? "justify-start" : "justify-between"}`}
      >
        <p
          className={`min-w-0 flex-1 leading-snug ${spotlight ? "text-[11px] font-medium tracking-wide text-zinc-400 tabular-nums sm:text-xs" : "text-xs text-zinc-400"}`}
        >
          {timeLabel}
        </p>
        {isOpenedVisual && !hideShare ? (
          <button
            type="button"
            onClick={async () => {
              try {
                const url = `${window.location.origin}/gallery#capsule-${item.id}`;
                await navigator.clipboard.writeText(url);
                setShareStatus("copied");
                setTimeout(() => setShareStatus(""), 1500);
              } catch {
                setShareStatus("failed");
                setTimeout(() => setShareStatus(""), 2000);
              }
            }}
            className="min-h-10 shrink-0 rounded-lg px-2 text-sm text-cyan-400 hover:bg-white/[0.06] hover:text-cyan-300 md:min-h-0 md:px-0 md:text-xs md:hover:bg-transparent"
          >
            {shareStatus === "copied"
              ? "Copied"
              : shareStatus === "failed"
                ? "Failed"
                : "Share"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
