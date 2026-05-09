"use client";

import type { ReactNode } from "react";

type CapsuleGridSlotProps = {
  children: ReactNode;
  /** Subtle lift on hover (Home / Gallery cards). */
  hover?: boolean;
  /** For deep links: `capsule-${id}` */
  scrollId?: string;
};

/**
 * Neon gradient frame — same look on Home Recently Opened and Gallery.
 */
export function CapsuleGridSlot({
  children,
  hover = true,
  scrollId,
}: CapsuleGridSlotProps) {
  return (
    <div
      id={scrollId}
      className={`neon-border flex h-full min-h-[30rem] flex-col ${scrollId ? "scroll-mt-28" : ""} ${hover ? "transition-transform duration-300 hover:-translate-y-0.5" : ""}`}
    >
      <div className="neon-border__inner flex h-full min-h-[30rem] flex-1 flex-col p-1.5">
        {children}
      </div>
    </div>
  );
}
