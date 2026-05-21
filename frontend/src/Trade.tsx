import { useEffect, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits, maxUint256 } from "viem";
import { erc20Abi, routerAbi, pairAbi } from "./abi";
import {
  ROUTER_ADDRESS,
  PAIR_ADDRESS,
  TOKEN_ADDRESS,
  USDC_ADDRESS,
  TOKEN_DECIMALS,
  USDC_DECIMALS,
  SLIPPAGE_BPS,
  uniswapExploreUrl,
} from "./config";

/** Uniswap v2 constant-product output, net of the 0.3% fee. */
function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const amountInWithFee = amountIn * 997n;
  return (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee);
}

type Side = "buy" | "sell";

/** In-app swap against the Uniswap v2 pool (no Uniswap UI / Permit2 needed). */
export function Trade({ onTraded }: { onTraded?: () => void }) {
  const { address } = useAccount();
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [action, setAction] = useState<"approve" | "swap" | null>(null);

  const isBuy = side === "buy";
  const inputToken = isBuy ? USDC_ADDRESS : TOKEN_ADDRESS;
  const inDecimals = isBuy ? USDC_DECIMALS : TOKEN_DECIMALS;
  const outDecimals = isBuy ? TOKEN_DECIMALS : USDC_DECIMALS;
  const inSym = isBuy ? "USDC" : "NUAE";
  const outSym = isBuy ? "NUAE" : "USDC";
  const path = (
    isBuy ? [USDC_ADDRESS, TOKEN_ADDRESS] : [TOKEN_ADDRESS, USDC_ADDRESS]
  ) as readonly `0x${string}`[];

  let amountIn = 0n;
  try {
    amountIn = amount ? parseUnits(amount, inDecimals) : 0n;
  } catch {
    amountIn = 0n;
  }

  // Quote from pair reserves (fixed-size return — robust vs getAmountsOut).
  const { data: reserves, error: quoteError } = useReadContract({
    address: PAIR_ADDRESS,
    abi: pairAbi,
    functionName: "getReserves",
  });
  // token0 = USDC (lower address), token1 = NUAE.
  const usdcReserve = reserves ? reserves[0] : undefined;
  const nuaeReserve = reserves ? reserves[1] : undefined;

  let quoteOut: bigint | undefined;
  if (amountIn > 0n && usdcReserve !== undefined && nuaeReserve !== undefined) {
    quoteOut = isBuy
      ? getAmountOut(amountIn, usdcReserve, nuaeReserve) // USDC in → NUAE out
      : getAmountOut(amountIn, nuaeReserve, usdcReserve); // NUAE in → USDC out
  }
  const minOut = quoteOut ? quoteOut - (quoteOut * SLIPPAGE_BPS) / 10_000n : 0n;

  // Allowance for the input token
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: inputToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address!, ROUTER_ADDRESS],
    query: { enabled: Boolean(address) },
  });
  const needsApproval =
    allowance !== undefined && amountIn > 0n && allowance < amountIn;

  // Balance of the token being spent
  const { data: inputBalance } = useReadContract({
    address: inputToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: Boolean(address) },
  });
  const insufficientBalance =
    inputBalance !== undefined && amountIn > 0n && amountIn > inputBalance;

  // Human-readable reason the action button is disabled (if any).
  let hint: string | null = null;
  if (amountIn === 0n) hint = "Enter an amount.";
  else if (insufficientBalance)
    hint = `Insufficient ${inSym} balance${inputBalance !== undefined ? ` (${formatUnits(inputBalance, inDecimals)})` : ""}.`;
  else if (quoteError) hint = "No liquidity / couldn't fetch a quote.";
  else if (quoteOut === undefined) hint = "Fetching quote…";

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (!isSuccess) return;
    // After an approval, refresh allowance so the button flips to Buy/Sell.
    refetchAllowance();
    // Only a confirmed *swap* should refresh balances upstream.
    if (action === "swap") onTraded?.();
  }, [isSuccess, action, refetchAllowance, onTraded]);

  function doApprove() {
    setAction("approve");
    writeContract({
      address: inputToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [ROUTER_ADDRESS, maxUint256],
    });
  }

  function doSwap() {
    setAction("swap");
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    writeContract({
      address: ROUTER_ADDRESS,
      abi: routerAbi,
      functionName: "swapExactTokensForTokens",
      args: [amountIn, minOut, path, address!, deadline],
    });
  }

  const busy = isPending || confirming;

  return (
    <section className="card">
      <div className="label">Trade NUAE / USDC</div>

      <div className="tabs">
        <button
          className={`tab ${isBuy ? "active" : ""}`}
          onClick={() => {
            setSide("buy");
            setAction(null);
            reset();
          }}
        >
          Buy
        </button>
        <button
          className={`tab ${!isBuy ? "active" : ""}`}
          onClick={() => {
            setSide("sell");
            setAction(null);
            reset();
          }}
        >
          Sell
        </button>
      </div>

      <label className="field">
        <span>You pay ({inSym})</span>
        <input
          inputMode="decimal"
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>

      <p className="muted">
        {amountIn > 0n && quoteOut !== undefined
          ? `≈ ${formatUnits(quoteOut, outDecimals)} ${outSym}`
          : `Enter an amount to quote ${outSym}.`}
      </p>

      {needsApproval ? (
        <button disabled={busy || amountIn === 0n || insufficientBalance} onClick={doApprove}>
          {busy ? "Approving…" : `Approve ${inSym}`}
        </button>
      ) : (
        <button
          disabled={busy || amountIn === 0n || insufficientBalance || quoteOut === undefined}
          onClick={doSwap}
        >
          {busy ? "Swapping…" : isBuy ? "Buy NUAE" : "Sell NUAE"}
        </button>
      )}

      {hint && <p className="muted small">{hint}</p>}

      {isSuccess && action === "swap" && <p className="ok-text">Swap confirmed.</p>}
      {isSuccess && action === "approve" && (
        <p className="ok-text">
          Approved — now click {isBuy ? "Buy NUAE" : "Sell NUAE"}.
        </p>
      )}
      {error && <p className="err-text">{error.message.split("\n")[0]}</p>}

      <p className="muted small">
        Routes directly through the Uniswap v2 pool. Buying NUAE requires a Naba
        Wallet account — only eligible addresses can receive it. Quotes include
        {" "}{Number(SLIPPAGE_BPS) / 100}% slippage tolerance.
      </p>

      <a className="poollink" href={uniswapExploreUrl()} target="_blank" rel="noreferrer">
        View NUAE price &amp; pool on Uniswap ↗
      </a>
    </section>
  );
}
