export function formatSealedUntil(unlockSec: number): string {
  const s = new Date(unlockSec * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `Sealed until ${s}`;
}

const MAX_REASONABLE_AGO_SEC = 120 * 365 * 86400; // cap wild RPC / data bugs

export function formatOpenedAgo(openedAtSec: number, nowSec: number): string {
  let opened = Math.floor(Number.isFinite(openedAtSec) ? openedAtSec : 0);
  const now = Math.floor(Number.isFinite(nowSec) ? nowSec : 0);
  if (now <= 0) return "Opened recently";
  if (opened > now) opened = now;
  const d = Math.max(0, now - opened);
  if (d > MAX_REASONABLE_AGO_SEC) {
    return "Opened a long time ago";
  }
  if (d < 60) {
    return `Opened ${d} second${d === 1 ? "" : "s"} ago`;
  }
  if (d < 3600) {
    const m = Math.floor(d / 60);
    return `Opened ${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (d < 86400) {
    const h = Math.floor(d / 3600);
    return `Opened ${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(d / 86400);
  if (days < 30) {
    return `Opened ${days} day${days === 1 ? "" : "s"} ago`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `Opened ${months} month${months === 1 ? "" : "s"} ago`;
  }
  const years = Math.floor(days / 365);
  return `Opened ${years} year${years === 1 ? "" : "s"} ago`;
}
