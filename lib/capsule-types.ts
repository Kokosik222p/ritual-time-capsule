import type { CapsuleTag } from "./capsule-categories";

export type { CapsuleTag };

export type CapsuleItem = {
  id: string;
  owner?: string;
  userPhoto: string;
  message: string;
  unlockAtUnix?: number;
  tag: CapsuleTag;
};
