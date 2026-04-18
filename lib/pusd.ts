/**
 * PUSD integration helpers — Jupiter swap + on-chain transfer utils.
 * Palm USD is a non-freezable, non-blacklistable USD stablecoin on Solana.
 */

import { Connection, VersionedTransaction, PublicKey } from "@solana/web3.js";
import { PUSD_MINT } from "./umbra";

const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6";

export interface SwapQuote {
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: { swapInfo: { label: string } }[];
}

/** Get a Jupiter quote for swapping `inputMint` → PUSD */
export async function getPusdQuote(
  inputMint: string,
  amountLamports: number
): Promise<SwapQuote> {
  const url = `${JUPITER_QUOTE_API}/quote?inputMint=${inputMint}&outputMint=${PUSD_MINT}&amount=${amountLamports}&slippageBps=50`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Jupiter quote failed: ${res.statusText}`);
  return res.json();
}

/** Build a Jupiter swap transaction for inputMint → PUSD */
export async function buildPusdSwapTx(
  quote: SwapQuote,
  userPublicKey: string
): Promise<VersionedTransaction> {
  const res = await fetch(`${JUPITER_QUOTE_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }),
  });
  if (!res.ok) throw new Error(`Jupiter swap build failed: ${res.statusText}`);
  const { swapTransaction } = await res.json();
  const txBytes = Buffer.from(swapTransaction, "base64");
  return VersionedTransaction.deserialize(txBytes);
}

/** Sign and send the swap transaction, return signature */
export async function executePusdSwap(
  tx: VersionedTransaction,
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
  rpcUrl: string
): Promise<string> {
  const signed = await signTransaction(tx);
  const connection = new Connection(rpcUrl, "confirmed");
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}
