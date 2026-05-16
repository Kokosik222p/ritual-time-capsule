"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { CapsuleCard } from "@/components/CapsuleCard";
import { CapsuleGridSlot } from "@/components/capsule-grid-slot";
import { useChainTime } from "@/components/web3-provider";
import {
  buildMyCapsulesFromCache,
  buildMyCapsulesList,
  capsuleReactKey,
} from "@/lib/capsule-lists";
import type { CapsuleItem } from "@/lib/capsule-types";
import {
  loadPublicOnchainCapsules,
  subscribePublicOnchainCapsules,
} from "@/lib/public-onchain-capsules";

export function MyCapsulesClient() {
  const { address, isConnected } = useAccount();
  const { nowSec, ready } = useChainTime();
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<CapsuleItem[]>([]);
  const chainNowSec = ready && nowSec > 0 ? nowSec : 0;
  const effectiveNowSec =
    chainNowSec > 0 ? chainNowSec : Math.floor(Date.now() / 1000);

  const walletReady = mounted && isConnected && Boolean(address);

  const syncFromCache = useCallback(() => {
    if (!address) return;
    setItems(buildMyCapsulesFromCache(address, effectiveNowSec));
  }, [address, effectiveNowSec]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!walletReady) return;
    syncFromCache();
    void loadPublicOnchainCapsules({ chainNowSec: effectiveNowSec }).then(() =>
      syncFromCache(),
    );
    void buildMyCapsulesList(address, effectiveNowSec);
    return subscribePublicOnchainCapsules(syncFromCache);
  }, [address, effectiveNowSec, syncFromCache, walletReady]);

  if (!mounted) {
    return null;
  }

  if (!walletReady) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-black/55 p-6 text-sm leading-relaxed text-zinc-400">
        Connect your wallet to view your capsules. Capsule data is loaded from
        Ritual Testnet on-chain logs and tokenURI metadata.
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
      {items.map((item, index) => (
        <CapsuleGridSlot key={capsuleReactKey(item, index)}>
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
