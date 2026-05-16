import { sanitizeCapsulePhotoUrl } from "@/lib/capsule-media";
import type { CapsuleItem } from "@/lib/capsule-types";

/** Photo + message from on-chain fields (metadata cache already merged in cache read). */
export function resolveCapsuleMedia(item: CapsuleItem): {
  photoSrc: string;
  messageText: string;
} {
  return {
    photoSrc: sanitizeCapsulePhotoUrl(
      typeof item.userPhoto === "string" ? item.userPhoto : "",
    ),
    messageText:
      typeof item.message === "string" ? item.message.trim() : "",
  };
}
