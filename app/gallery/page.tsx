import { GalleryClient } from "@/components/gallery-client";

export const dynamic = "force-dynamic";

export default function GalleryPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-10 space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.35em] text-purple-300/70">
          Community
        </p>
        <h1 className="ritual-title text-3xl font-semibold text-zinc-50 md:text-4xl">
          Gallery
        </h1>
        <p className="max-w-2xl text-zinc-400">
          Only opened capsules are shown — full photo and message, using Ritual
          chain time to decide what has unlocked.
        </p>
      </div>

      <GalleryClient />
    </div>
  );
}
