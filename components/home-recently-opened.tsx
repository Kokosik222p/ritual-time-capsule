"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CapsuleCard } from "@/components/CapsuleCard";
import { CapsuleFullViewModal } from "@/components/CapsuleFullViewModal";
import { CapsuleGridSlot } from "@/components/capsule-grid-slot";
import { useChainTime } from "@/components/web3-provider";
import {
  buildHomeRecentlyOpenedCapsules,
  buildHomeRecentlyOpenedFromCache,
  capsuleReactKey,
  HOME_RECENTLY_OPENED_COUNT,
} from "@/lib/capsule-lists";
import {
  loadPublicOnchainCapsules,
  subscribePublicOnchainCapsules,
} from "@/lib/public-onchain-capsules";
import type { CapsuleItem } from "@/lib/capsule-types";

export function HomeRecentlyOpened() {
  const { nowSec, ready } = useChainTime();
  const chainNowSec = ready && nowSec > 0 ? nowSec : 0;
  const effectiveNowSec =
    chainNowSec > 0 ? chainNowSec : Math.floor(Date.now() / 1000);
  const [mounted, setMounted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<CapsuleItem[]>([]);

  const syncFromCache = useCallback(() => {
    setItems(
      buildHomeRecentlyOpenedFromCache(
        effectiveNowSec,
        HOME_RECENTLY_OPENED_COUNT,
      ),
    );
  }, [effectiveNowSec]);

  useEffect(() => {
    setMounted(true);
    syncFromCache();
    void loadPublicOnchainCapsules({ chainNowSec: effectiveNowSec }).then(() =>
      syncFromCache(),
    );
    void buildHomeRecentlyOpenedCapsules(
      effectiveNowSec,
      HOME_RECENTLY_OPENED_COUNT,
    );
    return subscribePublicOnchainCapsules(syncFromCache);
  }, [effectiveNowSec, syncFromCache]);

  const selectedItem = useMemo(
    () =>
      selectedId ? items.find((item) => item.id === selectedId) ?? null : null,
    [items, selectedId],
  );

  const openCapsule = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const closeCapsule = useCallback(() => {
    setSelectedId(null);
  }, []);

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
            Latest opened capsules from the community.
          </p>
        </div>
        <Link
          href="/gallery"
          className="inline-flex min-h-11 shrink-0 items-center self-start rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-purple-300 transition hover:border-cyan-400/30 hover:text-cyan-400 md:min-h-0 md:border-0 md:bg-transparent md:px-0 md:py-0 md:pb-1 md:text-purple-400"
        >
          View gallery →
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
        {mounted
          ? items.map((item, index) => (
              <CapsuleGridSlot key={capsuleReactKey(item, index)}>
                <CapsuleCard
                  item={item}
                  variant="spotlight"
                  forceOpened
                  hideShare
                  onOpen={() => openCapsule(item.id)}
                  className="h-full min-h-0 flex-1 border-transparent"
                />
              </CapsuleGridSlot>
            ))
          : null}
      </div>
      <CapsuleFullViewModal item={selectedItem} onClose={closeCapsule} />
    </section>
  );
}
