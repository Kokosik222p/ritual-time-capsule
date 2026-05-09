"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ConnectWalletButton } from "@/components/connect-wallet-button";

const links = [
  { href: "/", label: "Home" },
  { href: "/create-capsule", label: "Create Capsule" },
  { href: "/my-capsules", label: "My Capsules" },
  { href: "/gallery", label: "Gallery" },
] as const;

function MenuIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    );
  }
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  /* Close drawer on navigation (e.g. browser back). Link clicks also call setMenuOpen(false). */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset mobile menu when the route changes
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-black/50 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-4 py-3 md:px-6 md:py-4 lg:max-w-7xl">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="flex min-w-0 shrink items-center gap-2.5 opacity-90 transition hover:opacity-100 sm:gap-3"
          >
            <Image
              src="/assets/logo.png"
              alt=""
              width={40}
              height={40}
              className="h-8 w-8 shrink-0 object-contain drop-shadow-[0_0_14px_rgba(6,182,212,0.35)] sm:h-9 sm:w-9"
              priority
            />
            <div className="min-w-0 flex flex-col leading-none">
              <span className="text-[0.6rem] font-semibold tracking-[0.26em] text-white sm:text-[0.65rem] sm:tracking-[0.28em]">
                RITUAL
              </span>
              <span className="mt-0.5 text-[0.6rem] font-semibold tracking-[0.2em] text-white/90 sm:mt-1 sm:text-[0.65rem] sm:tracking-[0.22em]">
                TIME CAPSULE
              </span>
            </div>
          </Link>

          <nav
            className="hidden flex-1 flex-wrap items-center justify-center gap-x-8 gap-y-2 md:flex"
            aria-label="Main"
          >
            {links.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className="group relative py-1 text-sm font-medium text-white/90 transition hover:text-white"
                >
                  {label}
                  <span
                    className={`absolute -bottom-0.5 left-0 right-0 h-0.5 origin-center rounded-full transition ${
                      active
                        ? "nav-link-active opacity-100 scale-x-100"
                        : "scale-x-0 bg-gradient-to-r from-purple-500 to-cyan-500 opacity-0 group-hover:scale-x-100 group-hover:opacity-70"
                    }`}
                    aria-hidden
                  />
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3 md:min-w-[140px] md:justify-end">
            <ConnectWalletButton />
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] text-white shadow-[0_0_20px_-6px_rgba(168,85,247,0.35)] transition hover:border-cyan-400/35 hover:bg-white/[0.07] md:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-main-nav"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <MenuIcon open={menuOpen} />
            </button>
          </div>
        </div>

        {menuOpen ? (
          <nav
            id="mobile-main-nav"
            className="mt-4 flex flex-col gap-1 border-t border-white/[0.08] pt-4 md:hidden"
            aria-label="Mobile"
          >
            {links.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-xl px-4 py-3.5 text-base font-medium transition ${
                    active
                      ? "bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(168,85,247,0.25)]"
                      : "text-white/85 hover:bg-white/[0.06]"
                  }`}
                  onClick={() => setMenuOpen(false)}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
