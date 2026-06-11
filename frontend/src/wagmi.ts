import { http } from "wagmi";
import { polygon } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { createAppKit } from "@reown/appkit/react";

// WalletConnect / Reown AppKit require a project id (free, from https://cloud.reown.com).
const projectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined;
if (!projectId) {
  throw new Error(
    "VITE_WC_PROJECT_ID is not set — it is required for WalletConnect/AppKit. " +
      "Get a free id at https://cloud.reown.com and add it to .env.",
  );
}

const rpc = import.meta.env.VITE_RPC_URL as string | undefined;
const override = rpc && rpc.length > 0 ? rpc : undefined;

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [polygon];

// The adapter owns the wagmi config (and the default connectors: injected /
// EIP-6963 announced wallets / WalletConnect). We only override the transport
// so reads go through our RPC instead of the public default.
const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks,
  transports: {
    [polygon.id]: http(override),
  },
});

export const config = wagmiAdapter.wagmiConfig;

// Registering NABA as a custom wallet makes it appear in THIS dApp's modal only
// (it is never published to the global WalletConnect explorer). On mobile, AppKit
// deep-links `nabapass://wc?uri=<encoded wc:…>`, which the wallet's pairing bridge
// catches.
createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  defaultNetwork: polygon,
  metadata: {
    name: "Naba UAE Gated Token",
    description: "NUAE claim faucet & eligibility demo",
    // Must match the deployed origin or AppKit logs a verify-origin warning.
    url: "https://uae-token-demo.naba.ae",
    icons: ["https://uae-token-demo.naba.ae/favicon.svg"],
  },
  customWallets: [
    {
      id: "naba-wallet",
      name: "NABA Wallet",
      homepage: "https://wallet.naba.ae",
      image_url: "https://wallet.naba.ae/icon-512.png",
      mobile_link: "nabapass://",
      // webapp_link / desktop_link optional
    },
  ],
  // Show ONLY NABA + the WalletConnect QR. Hide browser-injected wallets,
  // EIP-6963 announced wallets (MetaMask, Phantom, Rabby…), Coinbase, and the
  // registry "All Wallets" grid.
  enableWalletConnect: true,
  enableInjected: false,
  enableEIP6963: false,
  enableCoinbase: false,
  allWallets: "HIDE",
  featuredWalletIds: [],
  features: {
    email: false,
    socials: [],
    analytics: false,
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
