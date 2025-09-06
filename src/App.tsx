import React, { useMemo, useState } from "react";
import { WagmiProvider, http } from "wagmi";
import { mainnet, sepolia, optimism, base } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, ConnectButton, getDefaultConfig, lightTheme } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance, usePublicClient } from "wagmi";
import { isAddress, parseAbi, zeroAddress } from "viem";
import type { Address } from "viem";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl shadow-md border border-gray-200 p-5 bg-white">{children}</div>
  );
}

function Button(
  { children, onClick, disabled, variant = "primary" }:
  { children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: "primary" | "ghost" }) {
  const base = variant === "primary"
    ? "bg-black text-white hover:bg-gray-800"
    : "bg-transparent text-gray-700 hover:bg-gray-100 border border-gray-300";
  return (
    <button onClick={onClick} disabled={disabled}
      className={`rounded-xl px-4 py-2 text-sm transition ${base} disabled:opacity-50 disabled:cursor-not-allowed`}>{children}</button>
  );
}

function Input({ value, onChange, placeholder }: any) {
  return (
    <input value={value} onChange={onChange} placeholder={placeholder}
      className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black" />
  );
}

type RiskFacts = {
  isContract: boolean;
  bytecodeSize: number;
  hasApproveMethod: boolean;
  hasTransferFrom: boolean;
  recentDeploy: boolean;
  isEOA: boolean;
};

function scoreRisk(f: RiskFacts) {
  let s = 0;
  if (!f.isContract) s += 25;
  if (f.isEOA) s += 25;
  if (f.bytecodeSize < 2000) s += 10;
  if (f.hasApproveMethod && f.hasTransferFrom) s += 10;
  if (f.recentDeploy) s += 15;
  if (f.bytecodeSize === 0) s += 30;
  return Math.min(100, s);
}

function riskBadge(score: number) {
  if (score < 25) return <span className="text-green-700 bg-green-50 rounded-full px-2 py-1 text-xs">Low</span>;
  if (score < 60) return <span className="text-amber-700 bg-amber-50 rounded-full px-2 py-1 text-xs">Medium</span>;
  return <span className="text-red-700 bg-red-50 rounded-full px-2 py-1 text-xs">High</span>;
}

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 value) returns (bool)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);

const short = (a?: string) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";

function Analyzer() {
  const [address, setAddress] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | { score: number; facts: RiskFacts }>(null);
  const [error, setError] = useState<string>("");

  const publicClient = usePublicClient();

  const analyze = async () => {
    setError("");
    setResult(null);
    const addr = address.trim() as Address;
    if (!isAddress(addr)) {
      setError("Enter a valid Ethereum address (0x…)");
      return;
    }
    setLoading(true);
    try {
      const code = await publicClient.getBytecode({ address: addr });
      const isContract = !!code && code !== "0x";
      const isEOA = !isContract;
      const bytecodeSize = code ? (code.length - 2) / 2 : 0;
      const latest = await publicClient.getBlockNumber();
      const recentDeploy = false;
      let hasApproveMethod = false;
      let hasTransferFrom = false;
      if (isContract) {
        try {
          await publicClient.readContract({ address: addr, abi: erc20Abi, functionName: "balanceOf", args: [zeroAddress] as any });
        } catch (_) {}
        try {
          await publicClient.simulateContract({
            address: addr,
            abi: erc20Abi,
            functionName: "approve",
            args: [zeroAddress, 0n],
            account: zeroAddress,
          });
          hasApproveMethod = true;
        } catch (_) { hasApproveMethod = false; }
        try {
          await publicClient.simulateContract({
            address: addr,
            abi: erc20Abi,
            functionName: "transferFrom",
            args: [zeroAddress, zeroAddress, 0n],
            account: zeroAddress,
          });
          hasTransferFrom = true;
        } catch (_) { hasTransferFrom = false; }
      }
      const facts: RiskFacts = { isContract, bytecodeSize, hasApproveMethod, hasTransferFrom, recentDeploy, isEOA };
      const score = scoreRisk(facts);
      setResult({ score, facts });
    } catch (e: any) {
      setError(e?.message ?? "Failed to analyze address.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">AI Wallet Assistant — Risk Check</h3>
          <p className="text-sm text-gray-600">Paste a contract address. We’ll run client-side heuristics and show a risk hint. (Demo build)</p>
        </div>
        <div className="hidden md:block">{result && riskBadge(result.score)}</div>
      </div>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
        <Input value={address} onChange={(e: any) => setAddress(e.target.value)} placeholder="0x… contract address" />
        <Button onClick={analyze} disabled={loading}>{loading ? "Analyzing…" : "Analyze"}</Button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {result && (
        <div className="mt-5 grid gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Score:</span>
            <span className="text-base font-semibold">{result.score}/100</span>
            <div className="md:hidden">{riskBadge(result.score)}</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border p-3">
              <div className="font-medium mb-1">Signals</div>
              <ul className="list-disc list-inside text-gray-700 space-y-1">
                <li>Is contract: {String(result.facts.isContract)}</li>
                <li>Bytecode size: {result.facts.bytecodeSize} bytes</li>
                <li>Has approve(): {String(result.facts.hasApproveMethod)}</li>
                <li>Has transferFrom(): {String(result.facts.hasTransferFrom)}</li>
                <li>Recent deploy: {String(result.facts.recentDeploy)} (demo)</li>
              </ul>
            </div>
            <div className="rounded-xl border p-3">
              <div className="font-medium mb-1">Agent Suggestion</div>
              {result.score >= 60 ? (
                <p className="text-red-700">High risk. Avoid granting allowances or signing until you verify the code and team.</p>
              ) : result.score >= 25 ? (
                <p className="text-amber-700">Medium risk. Start with tiny amounts; revoke allowances after use.</p>
              ) : (
                <p className="text-green-700">Low risk (heuristic). Still verify on explorers before large funds.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function Header() {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Aegis — On-Chain AI Wallet Assistant</h1>
        <p className="text-gray-600 text-sm">Spot risky contracts before you sign. Public-good demo.</p>
      </div>
      <ConnectButton showBalance={false} accountStatus={{ smallScreen: "avatar", largeScreen: "full" }} />
    </div>
  );
}

const queryClient = new QueryClient();

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID!;
const wagmiConfig = getDefaultConfig({
  appName: "Aegis — AI Wallet Assistant",
  projectId: PROJECT_ID,
  chains: [mainnet, base, optimism, sepolia],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [optimism.id]: http(),
    [sepolia.id]: http(),
  },
});

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={lightTheme({ overlayBlur: "small" })}>
          <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white text-gray-900">
            <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
              <Header />
              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-2 space-y-4">
                  <Analyzer />
                </div>
                <div className="space-y-4">
                  <Card>
                    <div className="text-sm text-gray-700 space-y-2">
                      <div className="font-semibold">How it works</div>
                      <p>We connect your wallet (RainbowKit + wagmi), run a few on-chain heuristics (via viem), and produce a risk hint. In a full build, we add Tenderly simulations and LLM reasoning.</p>
                      <div className="font-semibold pt-2">Disclaimer</div>
                      <p>This is a demo. Do your own research. Never share seed phrases.</p>
                    </div>
                  </Card>
                  <Card>
                    <div className="text-sm text-gray-700 space-y-2">
                      <div className="font-semibold">Roadmap (hackathon)</div>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Transaction preview &lt;= Tenderly</li>
                        <li>Revoked approvals reminders</li>
                        <li>LLM agent: natural-language explanations</li>
                        <li>Farcaster mini-app surface</li>
                      </ul>
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}