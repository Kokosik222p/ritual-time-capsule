import { getLatestBlockTimestampSec } from "@/lib/chain-time";

export async function GET() {
  try {
    const now = await getLatestBlockTimestampSec();
    return Response.json({ now, source: "block" as const });
  } catch {
    const now = Math.floor(Date.now() / 1000);
    return Response.json({ now, source: "fallback" as const });
  }
}
