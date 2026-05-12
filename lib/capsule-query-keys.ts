/** TanStack Query keys for capsule lists (demo + minted from localStorage). */
export const CAPSULE_QUERIES = {
  root: ["ritual-capsules"] as const,
  user: (address: string | undefined) =>
    [...CAPSULE_QUERIES.root, "user", address?.toLowerCase() ?? "anon"] as const,
  gallery: () => [...CAPSULE_QUERIES.root, "gallery"] as const,
  homeRecentlyOpenedRoot: ["ritual-capsules", "home-recently-opened"] as const,
  homeRecentlyOpened: (nowSec: number) =>
    [...CAPSULE_QUERIES.homeRecentlyOpenedRoot, nowSec] as const,
};
