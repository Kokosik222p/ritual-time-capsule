"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CapsuleCard } from "@/components/CapsuleCard";
import { CapsuleFullViewModal } from "@/components/CapsuleFullViewModal";
import { CapsuleGridSlot } from "@/components/capsule-grid-slot";
import { useChainTime } from "@/components/web3-provider";
import { CAPSULE_QUERIES } from "@/lib/capsule-query-keys";
import {
  buildGalleryPool,
  filterOpenedAtChainTime,
} from "@/lib/capsule-lists";
import {
  loadPublicOnchainCapsuleById,
} from "@/lib/public-onchain-capsules";
import type { CapsuleItem } from "@/lib/capsule-types";

const GALLERY_PAGE_SIZE = 12;

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
  const [localNowSec, setLocalNowSec] = useState(() =>
    Math.floor(Date.now() / 1000),
  );
  const chainNowSec = ready && nowSec > 0 ? nowSec : 0;
  const effectiveNowSec = Math.max(chainNowSec, localNowSec);
  const queryClient = useQueryClient();
  const [visibleCount, setVisibleCount] = useState(GALLERY_PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [directItem, setDirectItem] = useState<CapsuleItem | null>(null);
  const [directLoading, setDirectLoading] = useState(false);

  const {
    data: pool,
    error,
    isPending,
  } = useQuery({
    queryKey: CAPSULE_QUERIES.gallery(),
    queryFn: () => buildGalleryPool(effectiveNowSec),
    staleTime: 15_000,
    gcTime: 30 * 60_000,
    placeholderData: (previousData) => previousData,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 5_000,
  });

  const openedItems = useMemo(() => {
    if (!pool) return [];
    return filterOpenedAtChainTime(pool, effectiveNowSec);
  }, [pool, effectiveNowSec]);
  const visibleItems = openedItems.slice(0, visibleCount);
  const selectedItem = selectedId
    ? openedItems.find((item) => item.id === selectedId) ?? directItem
    : null;
  const hasMore = visibleCount < openedItems.length;

  useEffect(() => {
    const id = window.setInterval(() => {
      setLocalNowSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const openCapsule = useCallback((id: string) => {
    setSelectedId(id);
    setDirectItem(null);
    const nextUrl = `${window.location.pathname}${window.location.search}#capsule-${id}`;
    window.history.replaceState(null, "", nextUrl);
  }, []);

  const closeCapsule = useCallback(() => {
    setSelectedId(null);
    setDirectItem(null);
    setDirectLoading(false);
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
      void queryClient.invalidateQueries({
        queryKey: CAPSULE_QUERIES.root,
        refetchType: "all",
      });
      void queryClient.refetchQueries({
        queryKey: CAPSULE_QUERIES.root,
        type: "active",
      });
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [queryClient]);

  useEffect(() => {
    if (!selectedId) return;
    if (openedItems.some((item) => item.id === selectedId)) return;

    const tokenId = tokenIdFromCapsuleId(selectedId);
    if (tokenId == null) return;

    let cancelled = false;
    setDirectLoading(true);
    loadPublicOnchainCapsuleById(tokenId)
      .then((item) => {
        if (cancelled) return;
        setDirectItem(item);
        if (item) {
          queryClient.setQueryData<CapsuleItem[]>(
            CAPSULE_QUERIES.gallery(),
            (current = []) => [
              item,
              ...current.filter((capsule) => capsule.id !== item.id),
            ],
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDirectLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [openedItems, queryClient, selectedId]);

  useEffect(() => {
    if (pool === undefined) return;
    console.debug("[GalleryClient] loaded", {
      nowSec: effectiveNowSec,
      chainReady: ready,
      total: pool.length,
      opened: openedItems.length,
      visible: visibleItems.length,
      error,
      items: pool.map((item) => ({
        id: item.id,
        unlockAtUnix: item.unlockAtUnix,
        isOpened:
          item.unlockAtUnix != null && item.unlockAtUnix <= effectiveNowSec,
        hasPhoto: Boolean(item.userPhoto),
        messageLength: item.message.length,
      })),
    });
  }, [
    effectiveNowSec,
    error,
    openedItems.length,
    pool,
    ready,
    visibleItems.length,
  ]);

  if (isPending && pool === undefined) {
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

  if (openedItems.length === 0) {
    return (
      <>
        <CapsuleFullViewModal
          item={directLoading ? directItem : selectedItem}
          onClose={closeCapsule}
        />
      </>
    );
  }

  return (
    <>
      <div className="ritual-card-grid lg:grid-cols-4">
        {visibleItems.map((item) => (
          <CapsuleGridSlot
            key={`${item.id}-${item.userPhoto ? item.userPhoto.slice(0, 80) : "no-photo"}`}
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

      {hasMore ? (
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={() =>
              setVisibleCount((current) => current + GALLERY_PAGE_SIZE)
            }
            className="rounded-full border border-white/12 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-cyan-300 transition hover:border-cyan-400/40 hover:bg-cyan-400/[0.08]"
          >
            Load more
          </button>
        </div>
      ) : null}

      <CapsuleFullViewModal item={selectedItem} onClose={closeCapsule} />
    </>
  );
}
