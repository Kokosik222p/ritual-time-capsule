import { CreateCapsuleClient } from "@/components/CreateCapsuleClient";

export default function CreateCapsulePage() {
  return (
    <div className="pb-12 sm:pb-16">
      <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-5 sm:pt-10 md:px-6">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-purple-300/80 sm:text-xs sm:tracking-[0.35em]">
          New ritual
        </p>
        <h1 className="ritual-title mt-2 text-2xl font-semibold leading-tight text-zinc-50 sm:text-3xl md:text-4xl">
          Create New Time Capsule
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-400">
          Seal your message. Choose when it unlocks on-chain. Preview the sealed
          capsule and your content side by side on desktop, or stacked on
          mobile.
        </p>
      </div>
      <CreateCapsuleClient />
    </div>
  );
}
