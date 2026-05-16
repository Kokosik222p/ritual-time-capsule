"use client";

import { useEffect, useState } from "react";
import { resolveCapsuleMedia } from "@/lib/capsule-display";
import type { CapsuleItem } from "@/lib/capsule-types";
import { loadPublicOnchainCapsuleById } from "@/lib/public-onchain-capsules";

function tokenIdFromCapsuleId(id: string): bigint | null {
  const raw = id.startsWith("onchain-") ? id.slice("onchain-".length) : id;
  if (!/^\d+$/.test(raw)) return null;
  return BigInt(raw);
}

export function CapsuleFullViewModal({
  item,
  onClose,
}: {
  item: CapsuleItem | null;
  onClose: () => void;
}) {
  const [shareStatus, setShareStatus] = useState<"" | "copied" | "failed">("");
  const [displayItem, setDisplayItem] = useState<CapsuleItem | null>(item);
  const [photoLoading, setPhotoLoading] = useState(false);

  useEffect(() => {
    setDisplayItem(item);
  }, [item]);

  useEffect(() => {
    if (!item) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [item, onClose]);

  useEffect(() => {
    if (!item) return;
    if (item.userPhoto.trim()) {
      setDisplayItem(item);
      return;
    }

    const tokenId = tokenIdFromCapsuleId(item.id);
    if (tokenId == null) return;

    let cancelled = false;
    setPhotoLoading(true);
    loadPublicOnchainCapsuleById(tokenId)
      .then((hydrated) => {
        if (cancelled || !hydrated) return;
        setDisplayItem(hydrated);
      })
      .finally(() => {
        if (!cancelled) setPhotoLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item]);

  if (!item) return null;

  const view = displayItem ?? item;
  const { photoSrc, messageText } = resolveCapsuleMedia(view);

  const shareUrl =
    typeof window === "undefined"
      ? `/gallery#capsule-${item.id}`
      : `${window.location.origin}/gallery#capsule-${item.id}`;

  async function shareCapsule() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus("copied");
      window.setTimeout(() => setShareStatus(""), 1500);
    } catch {
      setShareStatus("failed");
      window.setTimeout(() => setShareStatus(""), 2000);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/88 px-4 py-6 backdrop-blur-xl sm:px-6"
      role="dialog"
      aria-modal="true"
      aria-label="Opened capsule full view"
      onMouseDown={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/12 bg-zinc-950 shadow-[0_0_80px_rgba(168,85,247,0.22)] md:grid md:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-white/30 hover:bg-white/10"
        >
          Close
        </button>

        <div className="relative flex min-h-[18rem] items-center justify-center bg-black md:min-h-[34rem]">
          {photoSrc.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoSrc}
              alt="Opened capsule content"
              className="max-h-[60vh] w-full object-contain md:max-h-[82vh]"
              loading="eager"
              decoding="async"
            />
          ) : (
            <div className="flex min-h-[18rem] w-full items-center justify-center px-6 md:min-h-[34rem]">
              <div className="h-48 w-full max-w-md animate-pulse rounded-2xl bg-white/5" />
              {photoLoading ? (
                <span className="sr-only">Loading photo from chain</span>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-5 sm:p-6 md:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-purple-300">
              Opened Capsule
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              {view.tag}
            </h2>
          </div>

          <p className="whitespace-pre-wrap text-base leading-relaxed text-zinc-200">
            {messageText || (
              <span className="text-zinc-500 animate-pulse">
                Loading message from chain…
              </span>
            )}
          </p>

          <div className="mt-auto space-y-3 border-t border-white/10 pt-5">
            <p className="break-all text-xs leading-relaxed text-zinc-500">
              {shareUrl}
            </p>
            <button
              type="button"
              onClick={shareCapsule}
              className="w-full rounded-full bg-gradient-to-r from-purple-600 to-cyan-500 px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110"
            >
              {shareStatus === "copied"
                ? "Copied"
                : shareStatus === "failed"
                  ? "Copy failed"
                  : "Share capsule"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
