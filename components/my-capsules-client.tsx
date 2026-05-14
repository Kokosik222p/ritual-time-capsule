"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { CapsuleCard } from "@/components/CapsuleCard";
import { CapsuleGridSlot } from "@/components/capsule-grid-slot";
import { useChainTime } from "@/components/web3-provider";
import { CAPSULE_QUERIES } from "@/lib/capsule-query-keys";
import { buildMyCapsulesList, dedupeCapsules } from "@/lib/capsule-lists";

export function MyCapsulesClient() {
  const { address, isConnected } = useAccount();
  const { nowSec, ready } = useChainTime();
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const walletReady = mounted && isConnected && Boolean(address);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  const { data, isPending } = useQuery({
    queryKey: CAPSULE_QUERIES.user(address),
    queryFn: () => buildMyCapsulesList(address),
    select: (rows) => dedupeCapsules(rows ?? []),
    enabled: walletReady,
    staleTime: 2_000,
    gcTime: 30 * 60_000,
    placeholderData: (previousData) => previousData,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 5_000,
  });

  useEffect(() => {
    if (!walletReady || !ready || nowSec <= 0) return;
    void queryClient.refetchQueries({
      queryKey: CAPSULE_QUERIES.user(address),
      type: "active",
    });
  }, [address, nowSec, queryClient, ready, walletReady]);

  const items = data ?? [];

  if (!mounted) {
    return (
      <div className="ritual-card-grid lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <CapsuleGridSlot key={i} hover={false}>
            <div className="flex h-full min-h-[26rem] flex-col rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-950/90 to-black/90 p-4 sm:min-h-[28rem] sm:p-5 md:min-h-[30rem]">
              <div className="relative aspect-[4/3] min-h-[14rem] w-full shrink-0 animate-pulse rounded-xl bg-white/[0.06] sm:aspect-auto sm:h-56 sm:min-h-0 md:h-60" />
              <div className="mt-4 min-h-[4.25rem] animate-pulse rounded-lg bg-white/[0.05]" />
              <div className="mt-auto border-t border-white/[0.06] pt-4">
                <div className="h-3 w-2/5 animate-pulse rounded bg-white/[0.06]" />
              </div>
            </div>
          </CapsuleGridSlot>
        ))}
      </div>
    );
  }

  if (!walletReady) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-black/55 p-6 text-sm leading-relaxed text-zinc-400">
        Connect your wallet to view your capsules. Nothing from the public
        gallery is shown here until a wallet is connected.
      </div>
    );
  }

  if (isPending && data === undefined) {
    return (
      <div className="ritual-card-grid lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <CapsuleGridSlot key={i} hover={false}>
            <div className="flex h-full min-h-[26rem] flex-col rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-950/90 to-black/90 p-4 sm:min-h-[28rem] sm:p-5 md:min-h-[30rem]">
              <div className="relative aspect-[4/3] min-h-[14rem] w-full shrink-0 animate-pulse rounded-xl bg-white/[0.06] sm:aspect-auto sm:h-56 sm:min-h-0 md:h-60" />
              <div className="mt-4 min-h-[4.25rem] animate-pulse rounded-lg bg-white/[0.05]" />
              <div className="mt-auto border-t border-white/[0.06] pt-4">
                <div className="h-3 w-2/5 animate-pulse rounded bg-white/[0.06]" />
              </div>
            </div>
          </CapsuleGridSlot>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-black/55 p-6 text-sm leading-relaxed text-zinc-400">
        No capsules found for this wallet yet.
      </div>
    );
  }

  return (
    <div className="ritual-card-grid lg:grid-cols-3">
      {items.map((item) => (
        <CapsuleGridSlot
          key={`${item.id}-${item.userPhoto ? item.userPhoto.slice(0, 80) : "no-photo"}`}
        >
          <CapsuleCard
            item={item}
            forceOpened={false}
            className="h-full min-h-0 flex-1 border-transparent bg-black/75"
          />
        </CapsuleGridSlot>
      ))}
    </div>
  );
}
