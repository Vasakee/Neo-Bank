"use client";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { getClient, SUPPORTED_TOKENS, PUSD_MINT } from "@/lib/umbra";
import { registerAccount, shieldTokens, unshieldTokens, fetchEncryptedBalances } from "@/lib/actions";
import { getPusdQuote, buildPusdSwapTx, executePusdSwap } from "@/lib/pusd";
import { useBankStore } from "@/lib/store";
import { Navbar } from "@/components/Navbar";
import { ErrorModal } from "@/components/ErrorModal";
import { formatError } from "@/lib/errors";

type Toast = { id: number; message: string; ok: boolean };

export default function Dashboard() {
  const { connected, publicKey, signTransaction, signMessage } = useWallet();
  const { registered, shieldedBalances, txHistory, setRegistered, setShieldedBalance, addTx } =
    useBankStore();
  const [loading, setLoading] = useState("");
  const [shieldAmt, setShieldAmt] = useState("");
  const [unshieldAmt, setUnshieldAmt] = useState("");
  const [selectedMint, setSelectedMint] = useState(SUPPORTED_TOKENS[0].mint);
  const [errorMsg, setErrorMsg] = useState("");
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [publicTokenBalances, setPublicTokenBalances] = useState<Record<string, number>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);

  // PUSD swap state
  const [swapFromMint, setSwapFromMint] = useState(SUPPORTED_TOKENS[0].mint);
  const [swapAmt, setSwapAmt] = useState("");
  const [swapQuote, setSwapQuote] = useState<{ outAmount: string; priceImpactPct: string } | null>(null);
  const [swapLoading, setSwapLoading] = useState("");

  const token = SUPPORTED_TOKENS.find((t) => t.mint === selectedMint)!;
  const network = process.env.NEXT_PUBLIC_NETWORK ?? "mainnet";

  function showToast(message: string, ok: boolean) {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, ok }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }

  async function fetchPublicBalances(address: string) {
    const rpc = process.env.NEXT_PUBLIC_RPC_URL!;

    const [solRes, tokenRes, token2022Res] = await Promise.all([
      fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
      }).then((r) => r.json()),
      fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 2, method: "getTokenAccountsByOwner",
          params: [address, { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, { encoding: "jsonParsed" }],
        }),
      }).then((r) => r.json()),
      fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 3, method: "getTokenAccountsByOwner",
          params: [address, { programId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" }, { encoding: "jsonParsed" }],
        }),
      }).then((r) => r.json()),
    ]);

    if (solRes.result?.value != null) {
      setSolBalance(solRes.result.value / 1e9);
    }

    const balances: Record<string, number> = {};
    for (const { account } of [...(tokenRes.result?.value ?? []), ...(token2022Res.result?.value ?? [])]) {
      const info = account.data.parsed.info;
      balances[info.mint] = (info.tokenAmount.uiAmount ?? 0);
    }
    setPublicTokenBalances(balances);
  }

  // Hydrate registered state from localStorage after mount
  useEffect(() => {
    if (localStorage.getItem("ghostfi_registered") === "true") setRegistered(true);
  }, []);

  // Fetch SOL + token balances on connect
  useEffect(() => {
    if (!publicKey) return;
    fetchPublicBalances(publicKey.toBase58()).catch(console.error);
  }, [publicKey?.toBase58()]);
  useEffect(() => {
    if (!publicKey || !signTransaction || !signMessage) return;
    const address = publicKey.toBase58();
    getClient(address, signTransaction as any, signMessage as any)
      .then((client) => fetchEncryptedBalances(client, SUPPORTED_TOKENS.map((t) => t.mint)))
      .then((balances) => {
        for (const [mint, amount] of balances.entries()) {
          setShieldedBalance(mint, amount);
        }
      })
      .catch(() => {});
  }, [publicKey?.toBase58()]);

  async function refreshBalances() {
    if (!publicKey || !signTransaction || !signMessage) return;
    try {
      const address = publicKey.toBase58();
      const client = await getClient(address, signTransaction as any, signMessage as any);
      const balances = await fetchEncryptedBalances(client, SUPPORTED_TOKENS.map((t) => t.mint));
      for (const [mint, amount] of balances.entries()) {
        setShieldedBalance(mint, amount);
      }
      await fetchPublicBalances(address);
    } catch (_) {}
  }

  async function handleAirdrop() {
    setLoading("Airdropping...");
    try {
      const rpc = process.env.NEXT_PUBLIC_RPC_URL!;
      const address = publicKey!.toBase58();
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "requestAirdrop",
          params: [address, 2_000_000_000], // 2 SOL
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      await fetchPublicBalances(address);
    } catch (e: any) {
      setErrorMsg(formatError(e));
    }
    setLoading("");
  };

  async function getUmbraClient() {
    if (!publicKey || !signTransaction || !signMessage) throw new Error("Wallet not connected");
    return getClient(publicKey.toBase58(), signTransaction as any, signMessage as any);
  }

  async function handleRegister() {
    setLoading("Registering...");
    try {
      const client = await getUmbraClient();
      await registerAccount(client);
      setRegistered(true);
      showToast("Account registered successfully!", true);
    } catch (e: any) {
      showToast("Registration failed: " + formatError(e), false);
      setErrorMsg(formatError(e));
    }
    setLoading("");
  }

  async function handleShield() {
    const amount = BigInt(Math.round(parseFloat(shieldAmt) * 10 ** token.decimals));
    const available = publicTokenBalances[selectedMint] ?? 0;
    if (parseFloat(shieldAmt) > available) {
      showToast(`Insufficient balance. You have ${available} ${token.symbol}`, false);
      return;
    }
    setLoading("Shielding...");
    try {
      const client = await getUmbraClient();
      const result = await shieldTokens(client, selectedMint, amount);
      addTx({ type: "Shield", amount, mint: token.symbol, sig: result.queueSignature, ts: Date.now() });
      await refreshBalances();
      setShieldAmt("");
      showToast(`Shielded ${shieldAmt} ${token.symbol} successfully!`, true);
    } catch (e: any) {
      setErrorMsg(formatError(e));
    }
    setLoading("");
  }

  async function handleUnshield() {
    setLoading("Unshielding...");
    try {
      const client = await getUmbraClient();
      const amount = BigInt(Math.round(parseFloat(unshieldAmt) * 10 ** token.decimals));
      const result = await unshieldTokens(client, selectedMint, amount);
      addTx({ type: "Unshield", amount, mint: token.symbol, sig: result.queueSignature, ts: Date.now() });
      await refreshBalances();
      setUnshieldAmt("");
    } catch (e: any) {
      setErrorMsg(formatError(e));
    }
    setLoading("");
  }

  async function handleGetSwapQuote() {
    if (!swapAmt || parseFloat(swapAmt) <= 0) return;
    setSwapLoading("Fetching quote...");
    try {
      const amountLamports = Math.round(parseFloat(swapAmt) * 1e6);
      const quote = await getPusdQuote(swapFromMint, amountLamports);
      setSwapQuote({ outAmount: quote.outAmount, priceImpactPct: quote.priceImpactPct });
    } catch (e: any) {
      setErrorMsg(formatError(e));
    }
    setSwapLoading("");
  }

  async function handleSwapToPusd() {
    if (!swapQuote || !publicKey || !signTransaction) return;
    setSwapLoading("Swapping...");
    try {
      const amountLamports = Math.round(parseFloat(swapAmt) * 1e6);
      const quote = await getPusdQuote(swapFromMint, amountLamports);
      const tx = await buildPusdSwapTx(quote, publicKey.toBase58());
      const sig = await executePusdSwap(tx, signTransaction as any, process.env.NEXT_PUBLIC_RPC_URL!);
      addTx({ type: "Swap→PUSD", amount: BigInt(quote.outAmount), mint: "PUSD", sig, ts: Date.now() });
      await fetchPublicBalances(publicKey.toBase58());
      setSwapAmt("");
      setSwapQuote(null);
      showToast(`Swapped to ${(Number(quote.outAmount) / 1e6).toFixed(2)} PUSD!`, true);
    } catch (e: any) {
      setErrorMsg(formatError(e));
    }
    setSwapLoading("");
  }

  if (!connected) {
    return (
      <>
        <Navbar />
        <div className="flex items-center justify-center h-[80vh] text-gray-400">
          Connect your wallet to continue
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-lg text-sm font-medium shadow-lg text-white transition-all ${
              t.ok ? "bg-green-600" : "bg-red-600"
            }`}
          >
            {t.ok ? "✓" : "✗"} {t.message}
          </div>
        ))}
      </div>
      {errorMsg && <ErrorModal error={errorMsg} onClose={() => setErrorMsg("")} />}
      <main className="max-w-2xl mx-auto px-4 py-10 space-y-8">
        {/* Balance Card */}
        <div className="bg-gradient-to-br from-brand to-brand-dark rounded-2xl p-6 space-y-1">
          <p className="text-sm text-purple-200">Private Balance</p>
          <p className="text-4xl font-bold">
            {(Number(shieldedBalances[selectedMint] ?? 0n) / 10 ** token.decimals).toFixed(2)}{" "}
            {token.symbol}
          </p>
          <p className="text-xs text-purple-300">🔒 Encrypted on-chain — only you can see this</p>
        </div>

        {/* Token selector */}
        <div className="flex gap-2">
          {SUPPORTED_TOKENS.map((t) => (
            <button
              key={t.mint}
              onClick={() => setSelectedMint(t.mint)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                selectedMint === t.mint ? "bg-brand text-white" : "bg-gray-800 text-gray-400"
              }`}
            >
              {t.symbol}
              {"tag" in t && (
                <span className="ml-1.5 text-[10px] bg-green-900 text-green-400 px-1.5 py-0.5 rounded-full">
                  {(t as any).tag}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* PUSD Swap Widget */}
        <div className="bg-gray-900 rounded-xl p-5 space-y-4 border border-green-900/40">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">Get PUSD</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Swap USDC/USDT → Palm USD — no freeze, no blacklist
              </p>
            </div>
            <span className="text-[10px] bg-green-900 text-green-400 px-2 py-1 rounded-full font-medium">
              non-freezable
            </span>
          </div>

          <div className="flex gap-2">
            {SUPPORTED_TOKENS.filter((t) => t.symbol !== "PUSD").map((t) => (
              <button
                key={t.mint}
                onClick={() => { setSwapFromMint(t.mint); setSwapQuote(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  swapFromMint === t.mint ? "bg-brand text-white" : "bg-gray-800 text-gray-400"
                }`}
              >
                {t.symbol}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Amount"
              value={swapAmt}
              onChange={(e) => { setSwapAmt(e.target.value); setSwapQuote(null); }}
              className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none"
            />
            <button
              onClick={handleGetSwapQuote}
              disabled={!!swapLoading || !swapAmt}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              {swapLoading === "Fetching quote..." ? "..." : "Quote"}
            </button>
          </div>

          {swapQuote && (
            <div className="bg-gray-800 rounded-lg px-4 py-3 text-xs space-y-1">
              <div className="flex justify-between text-gray-300">
                <span>You receive</span>
                <span className="text-green-400 font-semibold">
                  {(Number(swapQuote.outAmount) / 1e6).toFixed(4)} PUSD
                </span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Price impact</span>
                <span>{parseFloat(swapQuote.priceImpactPct).toFixed(3)}%</span>
              </div>
            </div>
          )}

          <button
            onClick={handleSwapToPusd}
            disabled={!!swapLoading || !swapQuote || !publicKey}
            className="w-full bg-green-700 hover:bg-green-600 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {swapLoading === "Swapping..." ? "Swapping..." : "Swap → PUSD 🌴"}
          </button>
        </div>

        {/* SOL balance + devnet airdrop */}
        <div className="bg-gray-900 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">SOL Balance ({network})</p>
            <p className="text-sm font-semibold">{solBalance !== null ? `${solBalance.toFixed(4)} SOL` : "—"}</p>
          </div>
          {solBalance !== null && solBalance < 0.5 && network === "devnet" && (
            <button
              onClick={handleAirdrop}
              disabled={!!loading}
              className="bg-yellow-600 hover:bg-yellow-500 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              {loading === "Airdropping..." ? "Airdropping..." : "Airdrop 2 SOL"}
            </button>
          )}
        </div>

        {/* Public token balances */}
        <div className="bg-gray-900 rounded-xl p-4 space-y-2">
          <p className="text-xs text-gray-400">Public Wallet Balances</p>
          {SUPPORTED_TOKENS.map((t) => (
            <div key={t.mint} className="flex justify-between text-sm">
              <span className="text-gray-300">{t.symbol}</span>
              <span className="font-semibold">{(publicTokenBalances[t.mint] ?? 0).toFixed(2)}</span>
            </div>
          ))}
        </div>

        {/* Register */}
        {!registered && (
          <div className="bg-gray-900 rounded-xl p-5 space-y-3">
            <p className="text-sm text-gray-300">
              First time? Register your GhostFi account to enable private balances.
            </p>
            <button
              onClick={handleRegister}
              disabled={!!loading || !publicKey}
              className="bg-brand hover:bg-brand-dark px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {loading || "Register Account"}
            </button>
          </div>
        )}

        {/* Shield / Unshield */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-900 rounded-xl p-5 space-y-3">
            <p className="font-semibold text-sm">Shield Tokens</p>
            <p className="text-xs text-gray-400">Move tokens into your private balance</p>
            <input
              type="number"
              placeholder="Amount"
              value={shieldAmt}
              onChange={(e) => setShieldAmt(e.target.value)}
              className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none"
            />
            <button
              onClick={handleShield}
              disabled={!!loading || !shieldAmt || !publicKey || !registered}
              className="w-full bg-brand hover:bg-brand-dark py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {loading === "Shielding..." ? "Shielding..." : "Shield →"}
            </button>
          </div>

          <div className="bg-gray-900 rounded-xl p-5 space-y-3">
            <p className="font-semibold text-sm">Unshield Tokens</p>
            <p className="text-xs text-gray-400">Move tokens back to your public wallet</p>
            <input
              type="number"
              placeholder="Amount"
              value={unshieldAmt}
              onChange={(e) => setUnshieldAmt(e.target.value)}
              className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none"
            />
            <button
              onClick={handleUnshield}
              disabled={!!loading || !unshieldAmt || !publicKey || !registered}
              className="w-full bg-gray-700 hover:bg-gray-600 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {loading === "Unshielding..." ? "Unshielding..." : "← Unshield"}
            </button>
          </div>
        </div>

        {/* Tx History */}
        {txHistory.length > 0 && (
          <div className="bg-gray-900 rounded-xl p-5 space-y-3">
            <p className="font-semibold text-sm">Recent Activity</p>
            {txHistory.map((tx, i) => (
              <div key={i} className="flex justify-between text-sm border-b border-gray-800 pb-2">
                <span className="text-gray-300">{tx.type}</span>
                <span>{(Number(tx.amount) / 1e6).toFixed(2)} {tx.mint}</span>
                <a
                  href={`https://solscan.io/tx/${tx.sig}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand text-xs"
                >
                  View ↗
                </a>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
