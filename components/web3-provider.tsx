"use client";

/**
 * Single Web3 stack: `WagmiProvider` → `QueryClientProvider` → children.
 * Anything that uses wagmi hooks backed by TanStack Query (e.g. `useReconnect`)
 * must render *inside* `QueryClientProvider`.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { WagmiProvider, useReconnect } from "wagmi";
import { normalizeBlockTimestampToSeconds } from "@/lib/chain-time";
import { wagmiConfig } from "@/lib/wagmi-config";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

function WagmiAutoReconnect() {
  const { reconnectAsync } = useReconnect();
  useEffect(() => {
    reconnectAsync().catch(() => undefined);
  }, [reconnectAsync]);
  return null;
}

type ChainTimeState = { nowSec: number; ready: boolean };

const ChainTimeContext = createContext<ChainTimeState>({
  nowSec: 0,
  ready: false,
});

export function useChainTime(): ChainTimeState {
  return useContext(ChainTimeContext);
}

function ChainTimeBridge({ children }: { children: ReactNode }) {
  const [nowSec, setNowSec] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function pull() {
      try {
        const r = await fetch("/api/chain-now");
        const j: { now?: number } = await r.json();
        if (!cancelled && typeof j.now === "number") {
          setNowSec(normalizeBlockTimestampToSeconds(j.now));
        }
      } catch {
        if (!cancelled) {
          setNowSec(normalizeBlockTimestampToSeconds(Date.now()));
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    pull();
    const id = setInterval(pull, 25_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const value = useMemo(() => ({ nowSec, ready }), [nowSec, ready]);

  return (
    <ChainTimeContext.Provider value={value}>
      {children}
    </ChainTimeContext.Provider>
  );
}

export function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiAutoReconnect />
        <ChainTimeBridge>{children}</ChainTimeBridge>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
