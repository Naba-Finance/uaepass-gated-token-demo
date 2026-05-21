# Naba UAE Gated Token (NUAE) — demo

A demo of token-gating on **UAE Pass identity**, built on the public
[`@naba-finance/uaepass`](https://www.npmjs.com/package/@naba-finance/uaepass)
SDK. It has two parts:

- **`contracts/NabaUAEGatedToken.sol`** — an ERC-20 (9 decimals) that only UAE
  Pass accounts can hold/transfer, with a decaying faucet.
- **`frontend/`** — a small React + wagmi app showing eligibility, claim status,
  and Uniswap buy/sell links.

## How it works

| Feature | Rule |
| --- | --- |
| **Claim** | UAE Pass accounts only, once per 24h. Amount decays: 1, ½, ⅓, ¼ … NUAE (`1e9 / claimNumber`). Claiming mints new supply. |
| **Transfers** | Allowed only between *eligible* parties. `eligible = UAE Pass account OR owner-whitelisted`. Mint/burn are exempt. |
| **Whitelist** | `onlyOwner` (Ownable2Step). Exists so DEX contracts can hold/route NUAE. |
| **Seed liquidity** | `mintInitialLiquidity()` — owner-only, **callable once**, mints 100 NUAE to the owner to bootstrap a DEX pool. |
| **DEX** | Whitelist the Uniswap v2 **pair** (and router) so swaps flow; plain wallet-to-wallet stays UAE-Pass-only. |

Eligibility is checked via `ICredential.wasCreatedByUAEPass(account)` from the
SDK — a *provenance* check (was this address deployed by an official UAE Pass
factory), not a real-time control or KYC check.

### Claim amounts (9 decimals)

`amount = 1e9 / (claimCount + 1)` → 1.000000000, 0.500000000, 0.333333333, …

## Contracts

```bash
forge install      # pulls forge-std, openzeppelin-contracts, uaepass-sdk
forge test         # 15 tests
```

### Deploy

```bash
# Owner defaults to the broadcaster; CREDENTIAL defaults to the canonical
# UAE Pass Credential (0x8bA9...Cb0e), which is the same on every chain.
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$POLYGON_RPC_URL" --broadcast --account <acct> --sender <addr>
```

### Setting up a Uniswap v2 NUAE/USDC pool (mainnet)

Because NUAE only mints via `claim()` (small amounts, UAE-Pass-only), the owner
seeds the pool with the one-time `mintInitialLiquidity()`. Full flow:

1. `mintInitialLiquidity()` — mints 100 NUAE to the owner (once).
2. Create the pair via the v2 factory to get the **pair address**.
3. As owner, whitelist **yourself, the pair, and the router**:
   `setWhitelisted(owner, true)`, `setWhitelisted(pair, true)`,
   `setWhitelisted(router, true)`. The owner must be whitelisted because the
   owner is not a UAE Pass account and transfers are gated; the pair must be
   whitelisted *before* adding liquidity (which transfers NUAE into it).
4. `approve` the router and `addLiquidity(NUAE, USDC, …)` from the owner.

Afterwards a UAE Pass user can swap: buy (`pair → user`) and sell (`user → pair`)
both satisfy the gate. A non-UAE-Pass address still can't receive NUAE.

> Note: there is no CPMM DEX deployed on Polygon Amoy testnet, so the live pool
> is a mainnet step. On testnet the gating/whitelist behaviour is covered by the
> test suite (see the DEX scenario tests).

## Frontend

```bash
cd frontend
cp .env.example .env        # set VITE_TOKEN_ADDRESS to the deployed token
npm install
npm run dev
```

Shows: eligibility (UAE Pass yes/no), NUAE balance, claims made, last claim,
next claim amount, a claim button (with 24h cooldown), and Uniswap buy/sell
links.

## License

MIT — see [LICENSE](LICENSE).
