/**
 * Badges: темна непрозора основа + яскравий контур категорії + білий текст —
 * читається і на світлих, і на темних фото.
 */
export const CATEGORY_VISUAL = {
  Meme: {
    badge:
      "border-2 border-fuchsia-400 bg-black/82 text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset]",
    glow: "ring-fuchsia-400/50 shadow-[0_0_26px_-8px_rgba(232,121,249,0.55)]",
  },
  Work: {
    badge:
      "border-2 border-sky-400 bg-black/82 text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset]",
    glow: "ring-sky-400/50 shadow-[0_0_26px_-8px_rgba(56,189,248,0.5)]",
  },
  Personal: {
    badge:
      "border-2 border-violet-400 bg-black/82 text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset]",
    glow: "ring-violet-400/50 shadow-[0_0_26px_-8px_rgba(167,139,250,0.5)]",
  },
  Important: {
    badge:
      "border-2 border-rose-400 bg-black/82 text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset]",
    glow: "ring-rose-400/50 shadow-[0_0_26px_-8px_rgba(251,113,133,0.5)]",
  },
  Dream: {
    badge:
      "border-2 border-amber-400 bg-black/82 text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset]",
    glow: "ring-amber-400/50 shadow-[0_0_26px_-8px_rgba(251,191,36,0.45)]",
  },
  Nature: {
    badge:
      "border-2 border-emerald-400 bg-black/82 text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset]",
    glow: "ring-emerald-400/50 shadow-[0_0_26px_-8px_rgba(52,211,153,0.5)]",
  },
  Time: {
    badge:
      "border-2 border-cyan-400 bg-black/82 text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset]",
    glow: "ring-cyan-400/50 shadow-[0_0_26px_-8px_rgba(34,211,238,0.5)]",
  },
} as const;

export type CapsuleTag = keyof typeof CATEGORY_VISUAL;
