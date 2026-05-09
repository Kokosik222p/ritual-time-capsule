import { getConnection } from "wagmi/actions";
import { ConnectorAlreadyConnectedError } from "wagmi";
import type { Address } from "viem";
import { wagmiConfig } from "@/lib/wagmi-config";

export function isConnectorAlreadyConnectedError(
  error: unknown,
): error is ConnectorAlreadyConnectedError {
  return error instanceof ConnectorAlreadyConnectedError;
}

/** Reads the live connection from the wagmi store (works when hooks lag behind the connector). */
export function readConnectedAddress(): Address | undefined {
  const c = getConnection(wagmiConfig);
  if (c.status === "connected") return c.address;
  if (c.addresses?.[0]) return c.addresses[0];
  return undefined;
}
