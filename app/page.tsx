import Link from "next/link";
import { HomeRecentlyOpened } from "@/components/home-recently-opened";

function CapsuleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="9"
        y="3"
        width="6"
        height="18"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <line
        x1="12"
        y1="7"
        x2="12"
        y2="17"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="home-page mx-auto max-w-6xl px-4 pb-28 pt-16 sm:px-5 md:max-w-6xl md:px-8 md:pb-40 md:pt-28 lg:max-w-7xl lg:pt-32">
      <section
        className="home-hero flex flex-col items-center text-center"
        aria-labelledby="home-hero-title"
      >
        <h1
          id="home-hero-title"
          className="hero-title hero-title--home text-white"
        >
          Ritual Time Capsule
        </h1>

        <p className="hero-subtitle hero-subtitle--home mt-6 max-w-[34rem] px-1 md:mt-9 md:max-w-[42rem] lg:max-w-[46rem]">
          <span className="block">
            Seal a time-locked proof of your memories on Ritual.
          </span>
          <span className="mt-3 block md:mt-3.5">
            Your full photos stay in your browser; the on-chain mint stores the
            public metadata needed to reveal the capsule at the time you choose.
          </span>
        </p>

        <div className="mt-8 w-full max-w-md px-2 md:mt-11 md:max-w-none md:px-0">
          <Link
            href="/create-capsule"
            className="neon-cta-wrap neon-cta-wrap--home flex w-full max-w-md justify-center sm:inline-flex sm:w-auto"
          >
            <span className="neon-cta-inner neon-cta-inner--home w-full justify-center sm:w-auto">
              <CapsuleIcon className="shrink-0 text-cyan-300" />
              Create New Time Capsule
            </span>
          </Link>
        </div>
      </section>

      <HomeRecentlyOpened />
    </div>
  );
}
