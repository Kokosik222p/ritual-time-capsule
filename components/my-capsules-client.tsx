"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { CapsuleCard } from "@/components/CapsuleCard";
import { CapsuleGridSlot } from "@/components/capsule-grid-slot";
import { CAPSULE_QUERIES } from "@/lib/capsule-query-keys";
import { buildMyCapsulesList } from "@/lib/capsule-lists";

export function MyCapsulesClient() {
  const { address } = useAccount();

  const { data, isLoading } = useQuery({
    queryKey: CAPSULE_QUERIES.user(address),
    queryFn: () => buildMyCapsulesList(address),
  });

  if (isLoading || !data) {
    return (
      <div className="ritual-card-grid lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <CapsuleGridSlot key={i} hover={false}>
            <div className="flex h-full min-h-[26rem] flex-col rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-950/90 to-black/90 p-4 sm:min-h-[28rem] sm:p-5 md:min-h-[30rem]">
              <div className="relative h-52 w-full shrink-0 animate-pulse rounded-xl bg-white/[0.06] sm:h-56 md:h-60" />
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

  return (
    <div className="ritual-card-grid lg:grid-cols-3">
      {data.map((item) => (
        <CapsuleGridSlot key={item.id}>
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
