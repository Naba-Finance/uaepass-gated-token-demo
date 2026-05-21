import { useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { formatUnits } from "viem";
import { tokenAbi, credentialAbi } from "./abi";
import {
  TOKEN_ADDRESS,
  CREDENTIAL_ADDRESS,
  TOKEN_DECIMALS,
  CHAIN,
  polygonscanTokenUrl,
} from "./config";
import { Trade } from "./Trade";

const ZERO = "0x0000000000000000000000000000000000000000";

function fmt(v: bigint | undefined) {
  if (v === undefined) return "—";
  return formatUnits(v, TOKEN_DECIMALS);
}

function fmtDate(ts: bigint | undefined) {
  if (!ts || ts === 0n) return "never";
  return new Date(Number(ts) * 1000).toLocaleString();
}

export function App() {
  const { address, isConnected, chainId, connector } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  // Detect the connected wallet's self-reported identity (WalletConnect peer
  // metadata). UX hint only — the on-chain claim() still enforces eligibility,
  // so spoofing the name just makes a doomed claim revert.
  const [walletName, setWalletName] = useState<string>("");
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const provider = (await connector?.getProvider?.()) as
          | { session?: { peer?: { metadata?: { name?: string; url?: string } } } }
          | undefined;
        const meta = provider?.session?.peer?.metadata;
        if (active) setWalletName(`${meta?.name ?? ""} ${meta?.url ?? ""}`.trim());
      } catch {
        if (active) setWalletName("");
      }
    })();
    return () => {
      active = false;
    };
  }, [connector, address]);
  const isNabaWallet = /naba/i.test(walletName);

  const tokenConfigured = TOKEN_ADDRESS.toLowerCase() !== ZERO;
  const enabled = Boolean(address) && tokenConfigured;

  const { data, refetch, isLoading } = useReadContracts({
    query: { enabled, refetchInterval: 15_000 },
    contracts: [
      { address: TOKEN_ADDRESS, abi: tokenAbi, functionName: "balanceOf", args: [address!] },
      { address: TOKEN_ADDRESS, abi: tokenAbi, functionName: "isEligible", args: [address!] },
      { address: TOKEN_ADDRESS, abi: tokenAbi, functionName: "nextClaimAmount", args: [address!] },
      { address: TOKEN_ADDRESS, abi: tokenAbi, functionName: "claimableAt", args: [address!] },
      { address: TOKEN_ADDRESS, abi: tokenAbi, functionName: "claims", args: [address!] },
      { address: CREDENTIAL_ADDRESS, abi: credentialAbi, functionName: "wasCreatedByUAEPass", args: [address!] },
    ],
  });

  const balance = data?.[0]?.result as bigint | undefined;
  const eligible = data?.[1]?.result as boolean | undefined;
  const nextAmount = data?.[2]?.result as bigint | undefined;
  const claimableAt = data?.[3]?.result as bigint | undefined;
  const claimsTuple = data?.[4]?.result as readonly [bigint, bigint] | undefined;
  const isUAEPass = data?.[5]?.result as boolean | undefined;

  const lastClaimAt = claimsTuple?.[0];
  const claimCount = claimsTuple?.[1];

  const now = Math.floor(Date.now() / 1000);
  const cooldownLeft = claimableAt ? Number(claimableAt) - now : 0;
  // A detected Naba Wallet may be counterfactual (not yet deployed on-chain); its
  // first claim userOp deploys + registers it, so wasCreatedByUAEPass passes at
  // execution time. Treat it as eligible to claim even if the read is still false.
  const eligibleToClaim = Boolean(isUAEPass) || isNabaWallet;
  const canClaim = eligibleToClaim && cooldownLeft <= 0;

  const { writeContract, data: txHash, isPending: claiming, error: claimError } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // Refetch reads after a confirmed claim.
  useEffect(() => {
    if (confirmed) refetch();
  }, [confirmed, refetch]);

  const wrongChain = isConnected && chainId !== CHAIN.id;

  return (
    <div className="page">
      <div className="flag-stripe" />
      <div className="layout">
        <aside className="sidebar">
          <header className="brand">
            <div>
              <h1>NUAE</h1>
              <p className="sub">Naba UAE Gated Token</p>
            </div>
          </header>

          <section className="about">
            <h2>About</h2>
            <p>
              NUAE is a token gated by UAE identity through <b>Naba Wallet</b>. Only verified
              Naba Wallet accounts can claim and hold it — but anyone can trade it on a DEX.
            </p>

            <p className="disclaimer">
              <b>Disclaimer:</b> NUAE is a demo token for testing purposes only. It
              is not an investment, has no value, and carries no expectation of
              profit. Do not buy it expecting any return.
            </p>

            <h2>How it works</h2>
            <ol className="faq">
              <li>
                <b>Connect with Naba Wallet.</b> Get yours at{" "}
                <a href="https://wallet.naba.ae" target="_blank" rel="noreferrer">
                  wallet.naba.ae
                </a>
                .
              </li>
              <li>
                <b>Activate your wallet first.</b> Fund it and make at least one transaction —
                until your wallet has acted on-chain it isn't visible to the system and you'll
                show as ineligible.
              </li>
              <li>
                <b>Claim NUAE.</b> One claim per 24h, with a decaying reward: 1, then ½, ⅓, ¼ …
                NUAE.
              </li>
              <li>
                <b>Restricted transfers.</b> You can't send NUAE to a wallet that wasn't created
                with Naba Wallet.
              </li>
              <li>
                <b>But you can still trade.</b> NUAE is tradable on a whitelisted DEX pool (e.g.
                NUAE/USDC on Uniswap).
              </li>
            </ol>
          </section>

          <p className="contract-link">
            NUAE contract:{" "}
            <a href={polygonscanTokenUrl()} target="_blank" rel="noreferrer">
              {`${TOKEN_ADDRESS.slice(0, 6)}…${TOKEN_ADDRESS.slice(-4)}`} ↗
            </a>
          </p>

          <a
            className="github-link"
            href="https://github.com/Naba-Finance/uaepass-gated-token-demo"
            target="_blank"
            rel="noreferrer"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Source on GitHub
          </a>
        </aside>

        <main className="main">
          {!isConnected ? (
            <section className="card hero">
              <h2>Check your eligibility</h2>
              <p className="muted">Connect with Naba Wallet to claim and manage NUAE.</p>
              {connectors
                .filter((c) => c.id === "walletConnect")
                .map((c) => (
                  <button key={c.uid} onClick={() => connect({ connector: c })} disabled={connecting}>
                    {connecting ? "Connecting…" : "Connect with WalletConnect"}
                  </button>
                ))}
            </section>
          ) : (
            <>
          <section className="card row">
            <div>
              <div className="label">Connected</div>
              <div className="mono">{address}</div>
            </div>
            <button className="ghost" onClick={() => disconnect()}>
              Disconnect
            </button>
          </section>

          {!tokenConfigured && (
            <section className="card warn">
              Token address not set. Add <code>VITE_TOKEN_ADDRESS</code> to <code>.env</code> and restart.
            </section>
          )}

          {wrongChain && (
            <section className="card warn">
              <p>Wrong network — this demo runs on {CHAIN.name}.</p>
              <button onClick={() => switchChain({ chainId: CHAIN.id })} disabled={switching}>
                {switching ? "Switching…" : `Switch to ${CHAIN.name}`}
              </button>
            </section>
          )}

          <section className="card">
            <div className="label">Eligibility</div>
            <div className={`badge ${eligible ? "ok" : isNabaWallet ? "pending" : "no"}`}>
              {isLoading
                ? "Checking…"
                : eligible
                  ? "Eligible"
                  : isNabaWallet
                    ? "Naba Wallet — activates on first claim"
                    : "Not eligible"}
            </div>
            <ul className="facts">
              <li>
                <span>Naba Wallet account</span>
                <b>
                  {isUAEPass === undefined
                    ? "—"
                    : isUAEPass
                      ? "yes"
                      : isNabaWallet
                        ? "detected (not yet activated)"
                        : "no"}
                </b>
              </li>
              <li>
                <span>Balance</span>
                <b>{fmt(balance)} NUAE</b>
              </li>
              <li>
                <span>Claims made</span>
                <b>{claimCount === undefined ? "—" : claimCount.toString()}</b>
              </li>
              <li>
                <span>Last claim</span>
                <b>{fmtDate(lastClaimAt)}</b>
              </li>
              <li>
                <span>Next claim amount</span>
                <b>{fmt(nextAmount)} NUAE</b>
              </li>
            </ul>

            {isNabaWallet && !isUAEPass && !isLoading && (
              <p className="info">
                ⓘ This wallet isn't deployed on-chain yet, so the registry reports it as
                unregistered. Because you're connected with <b>Naba Wallet</b>, your first
                claim deploys and registers it in the same transaction — so it becomes
                eligible automatically.
              </p>
            )}
          </section>

          <section className="card">
            <div className="label">Claim</div>
            {!eligibleToClaim ? (
              <p className="muted">Only Naba Wallet accounts can claim.</p>
            ) : cooldownLeft > 0 ? (
              <p className="muted">
                Next claim available at {fmtDate(claimableAt)} (
                {Math.ceil(cooldownLeft / 3600)}h left).
              </p>
            ) : (
              <p className="muted">
                You can claim {fmt(nextAmount)} NUAE now.
                {!isUAEPass && isNabaWallet
                  ? " Your Naba Wallet activates on this first transaction."
                  : ""}
              </p>
            )}
            <button
              disabled={!canClaim || claiming || confirming}
              onClick={() =>
                writeContract({ address: TOKEN_ADDRESS, abi: tokenAbi, functionName: "claim", args: [] })
              }
            >
              {claiming ? "Confirm in wallet…" : confirming ? "Claiming…" : "Claim NUAE"}
            </button>
            {confirmed && <p className="ok-text">Claimed! Balance updated.</p>}
            {claimError && <p className="err-text">{claimError.message.split("\n")[0]}</p>}
          </section>

          <Trade onTraded={refetch} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
