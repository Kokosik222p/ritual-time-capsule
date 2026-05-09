import type { CapsuleTag } from "./capsule-categories";
import type { CapsuleItem } from "./capsule-types";

const week = 7 * 24 * 60 * 60;

/** Home grid: offsets from chain `now` (filled in client via `useChainTime`). */
export type HomeOpenedCapsuleSeed = {
  id: string;
  userPhoto: string;
  message: string;
  tag: CapsuleTag;
  /** Seconds since this capsule was "opened", relative to chain time. */
  openedAgoSec: number;
};

export const homeRecentlyOpenedSeeds: HomeOpenedCapsuleSeed[] = [
  {
    id: "r1",
    userPhoto:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=600&fit=crop",
    message: "A night under the stars — opened right on time.",
    openedAgoSec: week,
    tag: "Personal",
  },
  {
    id: "r2",
    userPhoto:
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&h=600&fit=crop",
    message: "A quiet dawn ritual, saved forever.",
    openedAgoSec: 2 * week,
    tag: "Dream",
  },
  {
    id: "r3",
    userPhoto:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&h=600&fit=crop",
    message: "Forest path — a promise to return.",
    openedAgoSec: 3 * week,
    tag: "Nature",
  },
  {
    id: "r4",
    userPhoto:
      "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=600&h=600&fit=crop",
    message: "Time holds the silence until the right moment.",
    openedAgoSec: 4 * week,
    tag: "Time",
  },
];

export function mapOpenSeedsToCapsules(
  chainNowSec: number,
  seeds: HomeOpenedCapsuleSeed[],
): CapsuleItem[] {
  const now = Math.floor(chainNowSec);
  return seeds.map((s) => ({
    id: s.id,
    userPhoto: s.userPhoto,
    message: s.message,
    tag: s.tag,
    unlockAtUnix: Math.max(0, now - s.openedAgoSec),
  }));
}

/** Wall-clock demo list for other routes (My Capsules, etc.). */
export const recentlyOpened: CapsuleItem[] = mapOpenSeedsToCapsules(
  Math.floor(Date.now() / 1000),
  homeRecentlyOpenedSeeds,
);

export const myCapsules: CapsuleItem[] = [
  ...recentlyOpened,
  {
    id: "m1",
    userPhoto:
      "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=600&h=600&fit=crop",
    message: "Not yet — but already written.",
    unlockAtUnix: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    tag: "Personal",
  },
  {
    id: "m2",
    userPhoto:
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=600&h=600&fit=crop",
    message: "In one year I will open this and remember today.",
    unlockAtUnix: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    tag: "Important",
  },
];

export const galleryCapsules: CapsuleItem[] = [
  ...myCapsules,
  {
    id: "g1",
    userPhoto:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&h=600&fit=crop",
    message: "Another open trail for the gallery.",
    unlockAtUnix: Math.floor(Date.now() / 1000) - 5 * week,
    tag: "Nature",
  },
];
