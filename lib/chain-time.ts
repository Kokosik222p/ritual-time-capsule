/** RPC URL for server-side reads (no CORS). Prefer RITUAL_RPC_URL on the server. */
export function getRitualRpcUrlForServer(): string {
  return (
    process.env.RITUAL_RPC_URL ||
    process.env.NEXT_PUBLIC_RITUAL_RPC_URL ||
    "https://rpc.ritualfoundation.org"
  );
}

/**
 * `eth_getBlockByNumber` returns seconds; some stacks mis-return ms.
 * Unix seconds in the 2020s are ~1.6e9–2e9.
 */
export function normalizeBlockTimestampToSeconds(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return raw;
  if (raw > 1_000_000_000_000) {
    return Math.floor(raw / 1000);
  }
  return Math.floor(raw);
}

export async function getLatestBlockTimestampSec(): Promise<number> {
  const rpc = getRitualRpcUrlForServer();
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBlockByNumber",
      params: ["latest", false],
    }),
    cache: "no-store",
  });

  const json: {
    result?: { timestamp?: string };
  } = await res.json();

  const hex = json?.result?.timestamp;
  if (!hex) {
    throw new Error("Invalid eth_getBlockByNumber response");
  }

  const parsed = parseInt(hex, 16);
  return normalizeBlockTimestampToSeconds(parsed);
}
