"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CapsuleCard } from "@/components/CapsuleCard";
import { CapsuleFullViewModal } from "@/components/CapsuleFullViewModal";
import { CapsuleGridSlot } from "@/components/capsule-grid-slot";
import { useChainTime } from "@/components/web3-provider";
import {
  buildGalleryDisplayItems,
  buildGalleryPool,
  capsuleReactKey,
} from "@/lib/capsule-lists";
import {
  loadPublicOnchainCapsuleById,
  loadPublicOnchainCapsules,
  subscribePublicOnchainCapsules,
} from "@/lib/public-onchain-capsules";
import type { CapsuleItem } from "@/lib/capsule-types";

function parseCapsuleHash(hash: string): string | null {
  const normalized = decodeURIComponent(hash.trim());
  if (!normalized.startsWith("#capsule-")) return null;

  const rawId = normalized.slice("#capsule-".length).trim();
  if (!rawId) return null;
  if (/^\d+$/.test(rawId)) return `onchain-${rawId}`;
  return rawId;
}

function tokenIdFromCapsuleId(id: string | null): bigint | null {
  if (!id) return null;
  const raw = id.startsWith("onchain-") ? id.slice("onchain-".length) : id;
  if (!/^\d+$/.test(raw)) return null;
  return BigInt(raw);
}

export function GalleryClient() {
  const { nowSec, ready } = useChainTime();
  const chainNowSec = ready && nowSec > 0 ? nowSec : 0;
  const effectiveNowSec =
    chainNowSec > 0 ? chainNowSec : Math.floor(Date.now() / 1000);
  const [mounted, setMounted] = useState(false);
  const [displayItems, setDisplayItems] = useState<CapsuleItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [directItem, setDirectItem] = useState<CapsuleItem | null>(null);

  const syncFromCache = useCallback(() => {
    setDisplayItems(buildGalleryDisplayItems(effectiveNowSec));
  }, [effectiveNowSec]);

  useEffect(() => {
    setMounted(true);
    syncFromCache();
    void loadPublicOnchainCapsules({ chainNowSec: effectiveNowSec }).then(() => {
      syncFromCache();
    });
    void buildGalleryPool(effectiveNowSec);
    return subscribePublicOnchainCapsules(syncFromCache);
  }, [effectiveNowSec, syncFromCache]);

  const selectedItem = useMemo(
    () =>
      selectedId
        ? displayItems.find((item) => item.id === selectedId) ?? directItem
        : null,
    [displayItems, directItem, selectedId],
  );

  const openCapsule = useCallback((id: string) => {
    setSelectedId(id);
    setDirectItem(null);
    const nextUrl = `${window.location.pathname}${window.location.search}#capsule-${id}`;
    window.history.replaceState(null, "", nextUrl);
  }, []);

  const closeCapsule = useCallback(() => {
    setSelectedId(null);
    setDirectItem(null);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      const id = parseCapsuleHash(window.location.hash);
      if (!id) return;
      setSelectedId(id);
      setDirectItem(null);
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    if (displayItems.some((item) => item.id === selectedId)) return;

    const tokenId = tokenIdFromCapsuleId(selectedId);
    if (tokenId == null) return;

    let cancelled = false;
    loadPublicOnchainCapsuleById(tokenId).then((item) => {
      if (cancelled || !item) return;
      setDirectItem(item);
      syncFromCache();
    });

    return () => {
      cancelled = true;
    };
  }, [displayItems, selectedId, syncFromCache]);

  if (!mounted) {
    return null;
  }

  return (
    <>
      {displayItems.length === 0 ? (
        <p className="rounded-2xl border border-white/[0.08] bg-black/55 p-6 text-sm leading-relaxed text-zinc-400">
          No opened capsules yet. Unlocked capsules from Ritual Testnet appear here
          automatically.
        </p>
      ) : (
        <div className="ritual-card-grid lg:grid-cols-4">
          {displayItems.map((item, index) => (
            <CapsuleGridSlot
              key={capsuleReactKey(item, index)}
              scrollId={`capsule-${item.id}`}
            >
              <CapsuleCard
                item={item}
                forceOpened
                onOpen={() => openCapsule(item.id)}
                className="h-full min-h-0 flex-1 border-transparent bg-black/75"
              />
            </CapsuleGridSlot>
          ))}
        </div>
      )}

      <CapsuleFullViewModal item={selectedItem} onClose={closeCapsule} />
    </>
  );
}
