import type { CapsuleTag } from "./capsule-categories";

export type { CapsuleTag };

export type CapsuleItem = {
  id: string;
  owner?: string;
  userPhoto: string;
  message: string;
  unlockAtUnix?: number;
  tag: CapsuleTag;
  /** Set when unlock time came from on-chain `isOpened()` (mint logs unavailable). */
  openedOnChain?: boolean;
};
