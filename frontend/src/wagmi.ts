import { http, createConfig } from "wagmi";
import { polygon } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

const rpc = import.meta.env.VITE_RPC_URL as string | undefined;
const override = rpc && rpc.length > 0 ? rpc : undefined;

// WalletConnect needs a project id (free, from https://cloud.reown.com).
// The connector is only enabled when VITE_WC_PROJECT_ID is set.
const wcProjectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined;

const connectors = [
  injected(),
  ...(wcProjectId
    ? [
        walletConnect({
          projectId: wcProjectId,
          showQrModal: true,
          metadata: {
            name: "Naba UAE Gated Token",
            description: "NUAE claim faucet & eligibility demo",
            url: "https://github.com/Naba-Finance/uaepass-gated-token-demo",
            icons: [],
          },
        }),
      ]
    : []),
];

export const config = createConfig({
  chains: [polygon],
  connectors,
  transports: {
    [polygon.id]: http(override),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
