/** Allow only safe image sources for <img src> (mitigates javascript: / XSS). */
export function sanitizeCapsulePhotoUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return "";

  const lower = url.toLowerCase();
  if (lower.startsWith("data:image/")) return url;
  if (lower.startsWith("https://")) return url;
  if (lower.startsWith("ipfs://")) {
    const rest = url.slice("ipfs://".length).replace(/^ipfs\//i, "");
    return `https://ipfs.io/ipfs/${rest}`;
  }

  return "";
}
