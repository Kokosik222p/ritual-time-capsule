import { MyCapsulesClient } from "@/components/my-capsules-client";

export const dynamic = "force-dynamic";

export default function MyCapsulesPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-16 md:px-8 md:py-20">
      <div className="mb-12 max-w-2xl space-y-4 md:mb-14">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-purple-300/85">
          Your collection
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
          My Capsules
        </h1>
        <p className="text-[0.9375rem] leading-relaxed text-zinc-500 md:text-base">
          Sealed capsules show only the closed form until unlock time passes
          (chain time). After mint, your capsule appears here automatically.
        </p>
      </div>

      <MyCapsulesClient />
    </div>
  );
}
