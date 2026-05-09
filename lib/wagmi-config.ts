import { createConfig, http } from "wagmi";
import { metaMask } from "wagmi/connectors";
import { ritualTestnet } from "./chain";

export const wagmiConfig = createConfig({
  chains: [ritualTestnet],
  connectors: [
    metaMask({
      dappMetadata: {
        name: "Ritual Time Capsule",
        url: "https://ritual-time-capsule.vercel.app",
      },
    }),
  ],
  transports: {
    [ritualTestnet.id]: http("https://rpc.ritualfoundation.org"),
  },
  ssr: true,
});
