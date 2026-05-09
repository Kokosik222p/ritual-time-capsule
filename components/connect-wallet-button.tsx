"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  useConnectors,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { ritualTestnet } from "@/lib/chain";
import { isConnectorAlreadyConnectedError } from "@/lib/wallet-connection";

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectWalletButton() {
  const { address, chainId, status, isConnected } = useAccount();
  const connectors = useConnectors();
  const { connectAsync, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();

  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  /** `metaMask()` from wagmi registers id `metaMaskSDK` (not `metaMask`). */
  const walletConnector =
    connectors.find((c) => c.id === "metaMaskSDK") ??
    connectors.find((c) => c.id === "metaMask") ??
    connectors[0];

  const onRitual =
    isConnected && chainId != null && chainId === ritualTestnet.id;
  const wrongChain =
    isConnected && chainId != null && chainId !== ritualTestnet.id;

  async function switchToRitual() {
    await switchChainAsync({ chainId: ritualTestnet.id });
  }

  /**
   * Connect without `chainId` first — MetaMask often rejects connect+unknown chain in one step.
   * Then switch to Ritual Testnet (1979).
   */
  const handleConnect = async () => {
    setError("");
    if (!walletConnector) {
      setError("No wallet connector. Reload the page or install MetaMask.");
      return;
    }

    try {
      if (isConnected && address) {
        if (chainId !== ritualTestnet.id) {
          await switchToRitual();
        }
        return;
      }

      const result = await connectAsync({
        connector: walletConnector,
      });

      if (result.chainId !== ritualTestnet.id) {
        await switchToRitual();
      }
    } catch (err) {
      if (isConnectorAlreadyConnectedError(err)) {
        try {
          await switchToRitual();
        } catch (switchErr) {
          const msg =
            switchErr instanceof Error
              ? switchErr.message
              : "Failed to switch network.";
          setError(msg);
          console.error(switchErr);
        }
        return;
      }

      const msg =
        err instanceof Error ? err.message : "Failed to connect wallet.";
      setError(msg);
      console.error(err);
    }
  };

  const handleSwitchNetwork = async () => {
    setError("");
    try {
      await switchToRitual();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to switch network.";
      setError(msg);
      console.error(err);
    }
  };

  if (!mounted) {
    return (
      <div className="h-9 w-[8.5rem] animate-pulse rounded-full bg-white/10" />
    );
  }

  if (!walletConnector) {
    return (
      <p className="max-w-[14rem] text-right text-xs text-amber-400/90">
        Wallet not ready. Use a browser with MetaMask.
      </p>
    );
  }

  if (status === "connected" && address && onRitual) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
        <div className="text-right">
          <div className="text-xs text-zinc-400">Ritual Testnet</div>
          <div className="text-sm font-medium text-white" title={address}>
            {shortenAddress(address)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => disconnect()}
          className="min-h-10 rounded-full border border-red-500/30 px-4 py-2 text-xs text-red-400 transition hover:bg-red-500/10 md:min-h-0 md:py-1.5"
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (status === "connected" && address && wrongChain) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="text-right text-xs text-amber-400/90">
          Wrong network ({chainId}). Switch to Ritual (1979).
        </div>
        <button
          type="button"
          onClick={handleSwitchNetwork}
          disabled={isSwitching}
          className="neon-outline-btn disabled:opacity-60"
        >
          {isSwitching ? "Confirm in MetaMask…" : "Switch to Ritual Testnet"}
        </button>
        {error ? (
          <p className="max-w-[14rem] text-right text-xs text-red-400">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleConnect}
        disabled={isConnecting || isSwitching}
        className="neon-outline-btn disabled:opacity-60"
      >
        {isConnecting || isSwitching
          ? "Confirm in MetaMask…"
          : "Connect Wallet"}
      </button>
      {error ? (
        <p className="max-w-[14rem] text-right text-xs text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
