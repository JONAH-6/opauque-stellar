import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  getPublicKey,
  isConnected as freighterIsConnected,
  requestAccess,
  signBlob,
  signTransaction,
} from "@stellar/freighter-api";
import { getNetworkPassphrase } from "../lib/chain";
import { getSorobanServer } from "../lib/stellar";
import type { SignTxFn } from "../lib/stellar";

export type ScannerSelfTestStatus = "idle" | "running" | "pass" | "fail";

export type StellarWalletContextValue = {
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  connect: () => Promise<string>;
  disconnect: () => void;
  signTransaction: SignTxFn;
  signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | null;
  /** Scanner health: WASM init + single ledger probe, run once per session after connect. */
  selfTestStatus: ScannerSelfTestStatus;
  selfTestError: string | null;
};

/** Runs once per session after wallet connect: WASM init probe + ledger RPC probe. */
async function runScannerSelfTest(): Promise<void> {
  // WASM init probe — same dynamic import as useOpaqueWasm, browser caches the module.
  const loadedModule = await (Function('return import("/pkg/cryptography.js")')() as Promise<
    Record<string, unknown> & { default: () => Promise<void> }
  >);
  await loadedModule.default();

  // Ledger RPC probe — confirms the Soroban RPC endpoint is reachable.
  const server = getSorobanServer();
  await server.getLatestLedger();
}

export const StellarWalletContext = createContext<StellarWalletContextValue | null>(null);

export function StellarWalletProviders({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const connectInFlightRef = useRef(false);

  const [selfTestStatus, setSelfTestStatus] = useState<ScannerSelfTestStatus>("idle");
  const [selfTestError, setSelfTestError] = useState<string | null>(null);
  const selfTestRanRef = useRef(false);

  useEffect(() => {
    if (!connected || selfTestRanRef.current) return;
    selfTestRanRef.current = true;
    setSelfTestStatus("running");
    runScannerSelfTest()
      .then(() => setSelfTestStatus("pass"))
      .catch((err: unknown) => {
        setSelfTestError(err instanceof Error ? err.message : String(err));
        setSelfTestStatus("fail");
      });
  }, [connected]);

  const connect = useCallback(async (): Promise<string> => {
    if (connectInFlightRef.current) {
      const pk = await getPublicKey();
      return pk;
    }
    connectInFlightRef.current = true;
    setConnecting(true);
    try {
      const alreadyAuthorized = await freighterIsConnected();
      if (!alreadyAuthorized) {
        await requestAccess();
      }
      const pk = await getPublicKey();
      setPublicKey(pk);
      setConnected(true);
      return pk;
    } finally {
      setConnecting(false);
      connectInFlightRef.current = false;
    }
  }, []);

  const disconnect = useCallback(() => {
    setPublicKey(null);
    setConnected(false);
  }, []);

  const signTx: SignTxFn = useCallback(async (xdr: string) => {
    return signTransaction(xdr, {
      networkPassphrase: getNetworkPassphrase(),
      accountToSign: publicKey ?? undefined,
    });
  }, [publicKey]);

  const signMessage = useCallback(async (message: Uint8Array) => {
    const b64 = Buffer.from(message).toString("base64");
    const signed = await signBlob(b64, { accountToSign: publicKey ?? undefined });
    return Uint8Array.from(Buffer.from(signed, "base64"));
  }, [publicKey]);

  const value = useMemo(
    () => ({
      publicKey,
      connected,
      connecting,
      connect,
      disconnect,
      signTransaction: signTx,
      signMessage,
      selfTestStatus,
      selfTestError,
    }),
    [publicKey, connected, connecting, connect, disconnect, signTx, signMessage, selfTestStatus, selfTestError],
  );

  return (
    <StellarWalletContext.Provider value={value}>{children}</StellarWalletContext.Provider>
  );
}

export async function tryRestoreFreighterSession(): Promise<string | null> {
  const ok = await freighterIsConnected();
  if (!ok) return null;
  try {
    return await getPublicKey();
  } catch {
    return null;
  }
}
