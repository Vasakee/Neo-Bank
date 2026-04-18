import { getUmbraClient } from "@umbra-privacy/sdk";
import { getTransactionEncoder, getTransactionDecoder } from "@solana/kit";
import { VersionedTransaction } from "@solana/web3.js";

let _client: Awaited<ReturnType<typeof getUmbraClient>> | null = null;
let _signerAddress: string | null = null;
let _signTxRef: ((tx: VersionedTransaction) => Promise<VersionedTransaction>) | null = null;
let _signMsgRef: ((msg: Uint8Array) => Promise<Uint8Array>) | null = null;

function buildSigner(
  address: string,
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>
) {
  return {
    address: address as any,

    async signTransaction(transaction: any) {
      console.log("[signTransaction] incoming signatures:", Object.keys(transaction.signatures ?? {}));
      console.log("[signTransaction] messageBytes length:", transaction.messageBytes?.length);

      const encoder = getTransactionEncoder();
      const decoder = getTransactionDecoder();

      const wireBytes = encoder.encode(transaction);
      const vTx = VersionedTransaction.deserialize(wireBytes as Uint8Array);

      console.log("[signTransaction] web3.js staticAccountKeys:", vTx.message.staticAccountKeys.map(k => k.toBase58()));
      console.log("[signTransaction] web3.js numRequiredSignatures:", vTx.message.header.numRequiredSignatures);
      console.log("[signTransaction] web3.js existing signatures:", vTx.signatures.map(s => Buffer.from(s).toString("hex").slice(0, 16) + "..."));

      const signed = await signTransaction(vTx);
      const signedWireBytes = signed.serialize();
      const decoded = decoder.decode(signedWireBytes as Uint8Array);

      return {
        ...transaction,
        signatures: { ...transaction.signatures, ...decoded.signatures },
      };
    },

    async signTransactions(transactions: any[]) {
      return Promise.all(transactions.map((tx: any) => this.signTransaction(tx)));
    },

    async signMessage(message: Uint8Array) {
      const signature = await signMessage(message);
      console.log("[signMessage] signature type:", typeof signature, "length:", signature?.length, "isUint8Array:", signature instanceof Uint8Array);
      // Solflare sometimes returns { signature: Uint8Array } instead of raw Uint8Array
      const sigBytes = (signature as any)?.signature instanceof Uint8Array
        ? (signature as any).signature
        : signature;
      return { signer: address as any, message, signature: sigBytes };
    },
  };
}

export async function getClient(
  address: string,
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>
) {
  if (_client && _signerAddress === address && _signTxRef === signTransaction) return _client;

  const signer = buildSigner(address, signTransaction, signMessage);

  _client = await getUmbraClient({
    signer: signer as any,
    network: (process.env.NEXT_PUBLIC_NETWORK as "mainnet" | "devnet") ?? "mainnet",
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL!,
    rpcSubscriptionsUrl: process.env.NEXT_PUBLIC_RPC_WS_URL!,
    indexerApiEndpoint: "https://utxo-indexer.api.umbraprivacy.com",
    deferMasterSeedSignature: false,
  });
  _signerAddress = address;
  _signTxRef = signTransaction;
  _signMsgRef = signMessage;
  return _client;
}

export function resetClient() {
  _client = null;
  _signerAddress = null;
  _signTxRef = null;
  _signMsgRef = null;
}

const isDevnet = process.env.NEXT_PUBLIC_NETWORK === "devnet";

export const USDC_MINT = isDevnet
  ? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
  : "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const USDT_MINT = isDevnet
  ? "EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS"
  : "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

// Palm USD — non-freezable, non-blacklistable USD stablecoin on Solana
// Ethereum contract (for reference): 0xfaf0cee6b20e2aaa4b80748a6af4cd89609a3d78
// TODO: Replace with the official Solana SPL mint — contact hello@palmusd.com or check their docs
export const PUSD_MINT = isDevnet
  ? "TODO_PUSD_DEVNET_MINT"
  : "TODO_PUSD_MAINNET_MINT";

export const SUPPORTED_TOKENS = [
  { symbol: "USDC", mint: USDC_MINT, decimals: 6 },
  { symbol: "USDT", mint: USDT_MINT, decimals: 6 },
  { symbol: "PUSD", mint: PUSD_MINT, decimals: 6, tag: "non-freezable" },
];
