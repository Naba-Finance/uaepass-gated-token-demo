import { polygon } from "wagmi/chains";

/** Chain the demo targets. NUAE is deployed on Polygon PoS mainnet. */
export const CHAIN = polygon;

/** Deployed NabaUAEGatedToken address (set VITE_TOKEN_ADDRESS in .env). */
export const TOKEN_ADDRESS = (import.meta.env.VITE_TOKEN_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

/** UAE Pass Credential — same address on every chain. */
export const CREDENTIAL_ADDRESS =
  "0x8bA9eB1FF63DEd9145d341f316758e6Ca132Cb0e" as `0x${string}`;

/** USDC on Polygon (native). The other side of the NUAE pool. */
export const USDC_ADDRESS =
  "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as `0x${string}`;

/** Uniswap v2 Router02 on Polygon (factory 0x9e5A…799C). Swaps route
 *  user↔pair directly through it, so the gate only needs the pair whitelisted. */
export const ROUTER_ADDRESS =
  "0xedf6066a2b290C185783862C7F4776A2C8077AD1" as `0x${string}`;

/** The NUAE/USDC Uniswap v2 pair (deterministic CREATE2 address). Used for
 *  quoting off getReserves(). token0 = USDC (lower address), token1 = NUAE. */
export const PAIR_ADDRESS =
  "0x267116699064eDDfE9b124C9c464B6c4715d4656" as `0x${string}`;

export const TOKEN_DECIMALS = 9;
export const USDC_DECIMALS = 6;

/** Slippage tolerance applied to swap quotes, in basis points (5%). */
export const SLIPPAGE_BPS = 500n;

/** NUAE token page on Uniswap (price, chart, pool). */
export const uniswapExploreUrl = () =>
  `https://app.uniswap.org/explore/tokens/polygon/${TOKEN_ADDRESS.toLowerCase()}`;

/** NUAE contract on the Polygon block explorer. */
export const polygonscanTokenUrl = () =>
  `https://polygonscan.com/token/${TOKEN_ADDRESS}`;
