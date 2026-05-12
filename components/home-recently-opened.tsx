"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import Link from "next/link";
import { CapsuleCard } from "@/components/CapsuleCard";
import { CapsuleGridSlot } from "@/components/capsule-grid-slot";
import { useChainTime } from "@/components/web3-provider";
import { CAPSULE_QUERIES } from "@/lib/capsule-query-keys";
import { buildHomeRecentlyOpenedCapsules } from "@/lib/capsule-lists";

const HOME_OPEN_COUNT = 3;

export function HomeRecentlyOpened() {
  const { nowSec, ready } = useChainTime();
  const hasChainNow = ready && nowSec > 0;

  const { data, isPending } = useQuery({
    queryKey: CAPSULE_QUERIES.homeRecentlyOpened(nowSec),
    queryFn: () => buildHomeRecentlyOpenedCapsules(nowSec, HOME_OPEN_COUNT),
    enabled: hasChainNow,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 25_000,
  });

  const items = data ?? [];
  const showSkeleton = !hasChainNow || (isPending && data === undefined);

  useEffect(() => {
    if (!hasChainNow || data === undefined) return;
    console.debug("[RecentlyOpened] fetched", {
      nowSec,
      count: data.length,
      items: data.map((item) => ({
        id: item.id,
        unlockAtUnix: item.unlockAtUnix,
        hasPhoto: Boolean(item.userPhoto),
        messageLength: item.message.length,
      })),
    });
  }, [data, hasChainNow, nowSec]);

  return (
    <section
      className="home-recently-opened mx-auto mt-12 w-full max-w-5xl md:mt-20 lg:mt-24"
      aria-labelledby="recently-opened-heading"
    >
      <div className="mb-8 flex flex-col gap-6 sm:mb-10 md:mb-12 md:flex-row md:items-end md:justify-between md:gap-10">
        <div className="max-w-xl space-y-3 md:space-y-4">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-purple-300/85">
            On-chain reveals
          </p>
          <h2
            id="recently-opened-heading"
            className="text-2xl font-semibold tracking-tight text-white md:text-3xl"
          >
            Recently Opened Capsules
          </h2>
          <p className="text-[0.9375rem] leading-relaxed text-zinc-500 md:text-base">
            Live Ritual chain time — your mints and community opens. Only
            unlocked capsules; no sealed artwork.
          </p>
        </div>
        <Link
          href="/gallery"
          className="inline-flex min-h-11 shrink-0 items-center self-start rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-purple-300 transition hover:border-cyan-400/30 hover:text-cyan-400 md:min-h-0 md:border-0 md:bg-transparent md:px-0 md:py-0 md:pb-1 md:text-purple-400"
        >
          View gallery →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-7 lg:gap-8">
        {showSkeleton
          ? Array.from({ length: HOME_OPEN_COUNT }, (_, i) => (
              <CapsuleGridSlot key={`sk-${i}`} hover={false}>
                <div className="flex h-full min-h-[26rem] flex-col rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-950/90 to-black/90 p-4 sm:min-h-[28rem] md:min-h-[30rem] md:p-5">
                  <div className="relative aspect-[4/3] min-h-[14rem] w-full shrink-0 animate-pulse rounded-xl bg-white/[0.06] sm:aspect-auto sm:h-[15.5rem] sm:min-h-0 md:h-64" />
                  <div className="mt-4 min-h-[4.25rem] animate-pulse rounded-lg bg-white/[0.05]" />
                  <div className="mt-auto border-t border-white/[0.06] pt-4">
                    <div className="h-3 w-2/5 animate-pulse rounded bg-white/[0.06]" />
                  </div>
                </div>
              </CapsuleGridSlot>
            ))
          : items.map((item) => (
              <CapsuleGridSlot
                key={`${item.id}-${item.userPhoto ? item.userPhoto.slice(0, 80) : "no-photo"}`}
              >
                <CapsuleCard
                  item={item}
                  variant="spotlight"
                  forceOpened
                  hideShare
                  className="h-full min-h-0 flex-1 border-transparent"
                />
              </CapsuleGridSlot>
            ))}
      </div>

      {!showSkeleton && items.length === 0 ? (
        <p className="mt-10 text-center text-sm text-zinc-500">
          No opened capsules to show yet. Mint one or check back after unlock
          times.
        </p>
      ) : null}
    </section>
  );
}
