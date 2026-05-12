"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { CapsuleCard } from "@/components/CapsuleCard";
import { CapsuleGridSlot } from "@/components/capsule-grid-slot";
import { useChainTime } from "@/components/web3-provider";
import { CAPSULE_QUERIES } from "@/lib/capsule-query-keys";
import {
  buildGalleryPool,
  filterOpenedAtChainTime,
} from "@/lib/capsule-lists";

export function GalleryClient() {
  const { nowSec, ready } = useChainTime();

  const { data: pool, isLoading } = useQuery({
    queryKey: CAPSULE_QUERIES.gallery(),
    queryFn: () => buildGalleryPool(),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 25_000,
  });

  const openedItems = useMemo(() => {
    if (!ready || nowSec <= 0 || !pool) return [];
    return filterOpenedAtChainTime(pool, nowSec);
  }, [pool, nowSec, ready]);

  if (isLoading || !pool) {
    return (
      <div className="ritual-card-grid lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <CapsuleGridSlot key={i} hover={false}>
            <div className="flex h-full min-h-[26rem] flex-col rounded-2xl border border-white/10 bg-black/75 p-4 sm:min-h-[28rem] md:min-h-[30rem]">
              <div className="relative aspect-[4/3] min-h-[14rem] w-full shrink-0 animate-pulse rounded-xl bg-white/5 sm:aspect-auto sm:h-56 sm:min-h-0 md:h-60" />
              <div className="mt-3 min-h-[4.25rem] animate-pulse rounded-lg bg-white/5" />
              <div className="mt-auto border-t border-white/5 pt-3">
                <div className="h-3 w-1/2 animate-pulse rounded bg-white/5" />
              </div>
            </div>
          </CapsuleGridSlot>
        ))}
      </div>
    );
  }

  if (!ready || nowSec <= 0) {
    return (
      <p className="text-sm text-zinc-500">Syncing chain time for gallery…</p>
    );
  }

  if (openedItems.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No opened capsules yet. Check back after unlock times pass on-chain.
      </p>
    );
  }

  return (
    <div className="ritual-card-grid lg:grid-cols-4">
      {openedItems.map((item) => (
        <CapsuleGridSlot
          key={`${item.id}-${item.userPhoto ? item.userPhoto.slice(0, 80) : "no-photo"}`}
          scrollId={`capsule-${item.id}`}
        >
          <CapsuleCard
            item={item}
            forceOpened
            className="h-full min-h-0 flex-1 border-transparent bg-black/75"
          />
        </CapsuleGridSlot>
      ))}
    </div>
  );
}
