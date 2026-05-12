export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-black/30">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs leading-relaxed text-zinc-500 sm:px-5 md:px-8">
        <p className="font-medium text-zinc-300">Privacy &amp; security</p>
        <p>
          Ritual Time Capsule does not upload your photos or messages to a
          Vercel server. Photos are resized in your browser to compact JPEG
          metadata before minting, so opened capsules can be displayed publicly.
          On-chain metadata is public and permanent.
        </p>
      </div>
    </footer>
  );
}
