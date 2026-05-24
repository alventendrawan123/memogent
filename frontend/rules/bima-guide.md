# Frontend Guide for Bima — Memogent

> Single source of truth for the Memogent frontend. Read end-to-end before writing code.
> Updated 2026-05-25 to match the actual deployed system (commit `b18e49a`). Earlier sections about `AgentVault`, multi-stage release, Lighthouse Kavach, `AgentDecisionReceipt` struct, and `riskScore` are no longer accurate — the implementation diverged from the original plan during W3.

---

## 0. Your scope

Bima, **you own everything under `d:\memogent\frontend\`**. The smart-contract + AI agent team does NOT touch this directory.

**Read FROM (in this order):**
1. `docs/flow.md` — full end-to-end system flow (REQUIRED first read)
2. This file — FE-specific patterns + actual ABIs
3. `skill/somnia/skill.md` — network info + agent platform
4. `skill/telegram/skill.md` — SIWE + bot deep-link pattern (for the link-Telegram page)

**You do NOT need:**
- `sc/src/` — implementation details, just need ABIs from `sc/out/`
- `agent/src/` — runs server-side on a different machine

---

## 1. Project context (60-second briefing)

**Memogent** = autonomous digital legacy guardian on Somnia. A user registers a will once, and from that point forward:
- Off-chain agent monitors them periodically via Somnia LLM consensus
- When deadline arrives (or AI classifies risk as EXECUTE), inheritance fires automatically
- AI-generated empathy message is sent to beneficiary
- Encrypted Time Capsule (uploaded earlier by owner) becomes claimable

**For the FE, you build:**
1. **Landing + onboarding** — wallet connect, create will, deposit STT/tokens/NFT
2. **Owner dashboard** — status, latest classification, check-in button, decision history
3. **Telegram linking page** — SIWE signing + deep-link to `@memogent_v1_bot`
4. **Capsule UI** — show owner if a capsule is attached; show beneficiary how to claim
5. **Beneficiary claim page** — fetch decryption key + Pinata content + decrypt
6. **Audit page** (optional) — public read-only view of a user's decision history

**Judging criteria that the FE directly affects:**
- **Functionality** — must work reliably during demo
- **Agent-First Design** — make the AI decisions VISIBLE (classifications, AI-generated empathy message, on-chain receipt links)
- **Autonomous Performance** — the dashboard should make the AI autonomy obvious without user effort

---

## 2. Live deployment — addresses + chain

```typescript
// lib/contracts.ts
export const CONTRACTS = {
  memogentCore:    "0x01b35186AA48d2feE071BAF36b83640660A5A6DC",
  memogentAgent:   "0x20b6af8924fdA1e3Ba49aeEFfE83029aC35D8867",   // V3 (active)
  timeCapsule:     "0x15054710dE55813Db967d85fb5B09DcfDF36c9b6",
  somniaAgents:    "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776",
} as const;

// Optional test assets:
export const TEST_TOKENS = {
  erc20Mock:  "0x83699CDCb35B5442904D9c45cD4973E734de69aD",  // MTT
  erc721Mock: "0xe7095E235c10165Ec04a8b9d28Fc4d0b37392779",
} as const;
```

**ABI source of truth:** `sc/out/<ContractName>.sol/<ContractName>.json` — the `abi` field. Manual copy step until W4 polish adds an automation script.

**Verified on:** https://shannon-explorer.somnia.network — all 4 contracts have source code visible to judges.

### Network config (Somnia Testnet)

```typescript
// lib/chains.ts
import { defineChain } from "viem";

export const somniaTestnet = defineChain({
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://api.infra.testnet.somnia.network/"] },
    public:  { http: ["https://dream-rpc.somnia.network"] },
  },
  blockExplorers: {
    default: { name: "Shannon Explorer", url: "https://shannon-explorer.somnia.network" },
  },
  testnet: true,
});
```

**Faucet:** https://testnet.somnia.network/ (32+ STT recommended for users planning to interact)

---

## 3. Tech stack — recommended (locked decisions)

| Layer | Pick | Why |
|---|---|---|
| Framework | **Next.js 14+** (App Router) | per project tech-stack memory |
| Wallet | **RainbowKit + wagmi v2** | best wallet UX, auto chain switch |
| EVM client | **viem** (via wagmi) | wagmi peer dep |
| Styling | **Tailwind + shadcn/ui** | fast hackathon polish |
| State | wagmi hooks + minimal `useState` | no Redux needed |
| Forms | **react-hook-form** + **zod** | validation |
| Date | **date-fns** | timestamp formatting |
| Charts | **Recharts** | classification history timeline |
| IPFS read | native `fetch` to Pinata gateway | only ciphertext, no auth needed |
| Crypto | **Web Crypto API (browser native)** | AES-256-GCM decrypt for capsule |
| Supabase read | `@supabase/supabase-js` with **anon key + RLS** | read-only access to wallet_link/tracked_will/etc |
| SIWE | **siwe** library | EIP-4361 for Telegram link |

```bash
pnpm add next react react-dom
pnpm add wagmi viem @tanstack/react-query
pnpm add @rainbow-me/rainbowkit
pnpm add @supabase/supabase-js
pnpm add siwe
pnpm add react-hook-form zod @hookform/resolvers
pnpm add date-fns recharts
pnpm add tailwindcss @tailwindcss/forms
pnpm add -D @types/node
```

---

## 4. Contract behavior — what to call

### 4.1 MemogentCore — will + vault

**User-facing writes:**

| Function | Args | When | Notes |
|---|---|---|---|
| `registerWill` | `(address beneficiary, uint256 inactivePeriodSec)` | First-time setup | Creates Reactivity subscription. Cannot register twice unless prior will was withdrawn/deactivated. Beneficiary cannot be msg.sender or zero |
| `checkIn` | `()` | User confirms alive | Resets `lastCheckIn`, subscribes new Reactivity event at new deadline. Old subscription silent-returns when it fires |
| `depositSTT` | `()` payable | Deposit native STT | `msg.value` added to vault |
| `depositToken` | `(address token, uint256 amount)` | After ERC20 `approve` | Pulls token via `transferFrom`. Uses `SafeTransfer` for non-standard ERC20 |
| `depositNFT` | `(address nft, uint256 tokenId)` | After NFT `approve` or `setApprovalForAll` | Pulls NFT via `safeTransferFrom`. Owner must already hold it |
| `withdraw` | `()` | User pulls all back | Vault drained to msg.sender. Will stays active (can re-deposit) |
| `updateBeneficiary` | `(address newBeneficiary)` | Change heir | Active will only |
| `updateInactiveperiod` | `(uint256 newPeriodSec)` | Extend/shorten deadline | Resubscribes Reactivity (note: spelling — single 'p') |
| `deactive` | `()` | Permanently disable will | (note: spelling — `deactive` not `deactivate`) Withdraw first if you want assets |

**All asset-handling functions are `nonReentrant`** after security polish.

**Read functions (view):**

| Function | Returns | Use case |
|---|---|---|
| `wills(user)` | 8-field tuple from auto-getter: `(owner, beneficiary, lastCheckIn, inactivePeriod, deadlineTimestamp, executed, active, subscriptionId)` | Full state |
| `getWillInfo(user)` | 6-field tuple: `(beneficiary, lastCheckIn, inactivePeriod, deadlineTimestamp, executed, active)` | Cleaner read for dashboard |
| `getStatus(user)` | `"Active"` \| `"Warning"` \| `"Inactive"` (string) | Status badge |
| `vaultSTT(user)` | uint256 wei | STT balance |
| `vaultTokens(user, index)` | `(address tokenAddress, uint256 amount)` | Per-token. Use `getVaultHistory` for full list with metadata |
| `vaultNFTs(user, index)` | `(address nftContract, uint256 tokenId)` | Per-NFT |
| `getCheckInHistory(user)` | `CheckInRecord[]` (`timestamp`, `blockNumber`) | Check-in audit |
| `getVaultHistory(user)` | `VaultRecord[]` (`actType`, `asset`, `amount`, `timestamp`, `blockNumber`) | Vault audit (actType: 1=STT deposit, 2=NFT deposit, 3=STT withdraw, 4=token withdraw, 5=NFT withdraw) |
| `agentAuthority()` | address | Currently V1 — won't change |
| `deployer()` | address | The wallet that deployed Core |

**Events:**

```solidity
event WillRegistered(address indexed owner, address indexed beneficiary, uint256 deadlineMs);
event CheckedIn(address indexed owner, uint256 newDeadlineMs);
event WillExecuted(address indexed owner, address indexed beneficiary, uint256 executedAt);
event WillDeactivates(address indexed owner);
event BeneficiaryUpdated(address indexed owner, address indexed newBeneficiary);
event DepositSTT(address indexed owner, uint256 amount);
event DepositToken(address indexed owner, address indexed token, uint256 amount);
event DepositNFT(address indexed owner, address indexed nftContract, uint256 tokenId);
event Withdrawn(address indexed owner, uint256 sttAmount);
event AgentAuthoritySet(address indexed agent);
```

### 4.2 MemogentAgent V3 — AI assessments + empathy

**This is where AI activity surfaces to the FE.**

**Reads:**

| Function | Returns | Notes |
|---|---|---|
| `latestAssessment(user)` | `(string classification, uint256 assessedAt, uint256 requestId)` | Last AI decision. Empty struct if never assessed |
| `empathyMessages(user)` | `string` | LLM-generated farewell text. Empty until execution + empathy dispatch |
| `lastAssessmentRequestAt(user)` | uint256 | Cooldown tracker (1 hour gap enforced) |
| `pendingAssessments(requestId)` | `(address user, uint256 requestedAt)` | Active in-flight assessment |
| `pendingEmpathy(requestId)` | address | Active in-flight empathy generation |

**Important — there is NO risk score.** Only categorical `classification` string:
- `"SAFE"` (recent activity)
- `"WATCH"` (mild inactivity)
- `"GRACE"` (moderate inactivity, warning)
- `"EXECUTE"` (critical inactivity — but Reactivity always handles execution at deadline)

**Events (subscribe to these for live UI):**

```solidity
event AssessmentRequested(uint256 indexed requestId, address indexed user, uint256 deposit);
event AssessmentRequestedWithContext(uint256 indexed requestId, address indexed user, string contextSummary);
event AssessmentReceived(uint256 indexed requestId, address indexed user, string classification);
event RiskDecision(address indexed user, string classification, uint256 timestamp);  // KEY UI event
event ExecutionTriggered(address indexed user);
event ExecutionRejectedByCore(address indexed user, string reason);  // expected for V3 (V1 holds authority)
event AssessmentFailed(uint256 indexed requestId, address indexed user, uint8 status);
event EmpathyMessageRequested(uint256 indexed requestId, address indexed user, uint256 deposit);
event EmpathyMessageGenerated(address indexed user, string message);  // KEY UI event
event EmpathyMessageFailed(uint256 indexed requestId, address indexed user, uint8 status);
```

**Writes** (the FE shouldn't normally call these — the autoAssess loop dispatches them. But for the demo or manual trigger):

| Function | Args | Cost |
|---|---|---|
| `assessRisk` | `(address user)` payable | 0.4 STT |
| `assessRiskWithContext` | `(address user, string extraSignals)` payable | 0.4 STT |
| `generateEmpathyMessage` | `(address user)` payable | 0.4 STT, one-shot per executed will |

### 4.3 TimeCapsule — encrypted IPFS pointers

**Writes (owner only):**

| Function | Args | When |
|---|---|---|
| `attachCapsule` | `(string cid, bytes32 contentHash, bytes encryptionKey)` | After encrypting + uploading to Pinata. Requires `active && !executed`. Overwrites previous |
| `removeCapsule` | `()` | Owner wants to retract (privacy). Only before execution |

**Reads:**

| Function | Returns | Caller restriction |
|---|---|---|
| `getCapsule(owner)` | `(string cid, bytes32 contentHash, uint256 attachedAt)` | Public — encryption key NOT exposed |
| `getDecryptionKey(owner)` | `bytes` | **Beneficiary only AND after execution.** Reverts otherwise |
| `isReleased(owner)` | bool | Public — true iff will executed |
| `hasCapsule(owner)` | bool | Public |

**Events:**

```solidity
event CapsuleAttached(address indexed owner, address indexed beneficiary, string cid, bytes32 contentHash);
event CapsuleUpdated(address indexed owner, string oldCid, string newCid);
event CapsuleRemoved(address indexed owner, string cid);
```

---

## 5. Supabase read access (for FE state that's not on-chain)

**Bima FE uses the `anon` key** (not `service_role`). Project URL: `https://zzqwohcpeoksdhorkwjq.supabase.co` (production URL — coordinate with team if rotation needed).

```bash
pnpm add @supabase/supabase-js
```

```typescript
// lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

**Tables accessible from FE (RLS policies must be added by SC team in W4 — currently service_role bypasses but you can scaffold queries now):**

| Table | Use case |
|---|---|
| `wallet_link` | "Is this wallet linked to a Telegram chat?" — for dashboard badge |
| `tracked_will` | "Is the autoAssess loop tracking this will?" + cached `last_classification` (faster than on-chain read) |
| `checkin` | Bot-initiated check-in history (W4 feature) |

**RLS pattern (planned):** anon role gets `SELECT` on `wallet_link`, `tracked_will`, `checkin` where `wallet_address` matches the signed-in wallet's JWT claim. For now, query freely during development.

```typescript
// Example: check if user has Telegram linked
async function isLinked(wallet: string): Promise<boolean> {
  const { data } = await supabase
    .from("wallet_link")
    .select("chat_id")
    .eq("wallet_address", wallet)
    .maybeSingle();
  return data !== null;
}
```

---

## 6. User flows — code patterns

### 6.1 Wagmi + RainbowKit setup

```typescript
// lib/wagmi.ts
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "viem";
import { somniaTestnet } from "./chains";

export const wagmiConfig = getDefaultConfig({
  appName: "Memogent",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
  chains: [somniaTestnet],
  transports: { [somniaTestnet.id]: http("https://api.infra.testnet.somnia.network/") },
  ssr: true,
});
```

```tsx
// app/providers.tsx
"use client";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

### 6.2 Register a will

```tsx
import { useWriteContract } from "wagmi";
import { CONTRACTS } from "@/lib/contracts";
import { memogentCoreAbi } from "@/abi/MemogentCore";

export function CreateWillForm() {
  const { writeContract, isPending } = useWriteContract();

  const onSubmit = (beneficiary: `0x${string}`, days: number) => {
    writeContract({
      address: CONTRACTS.memogentCore,
      abi: memogentCoreAbi,
      functionName: "registerWill",
      args: [beneficiary, BigInt(days * 86400)],
    });
  };
  // ... form UI
}
```

### 6.3 Check in (the most important button)

```tsx
const { writeContract } = useWriteContract();

const handleCheckIn = () => {
  writeContract({
    address: CONTRACTS.memogentCore,
    abi: memogentCoreAbi,
    functionName: "checkIn",
  });
};

<Button onClick={handleCheckIn} className="bg-green-500 ...">
  ✅ I'm alive — Check In
</Button>
```

After tx mines, refetch `willInfo` to show the new deadline.

### 6.4 Deposit STT

```tsx
import { parseEther } from "viem";

writeContract({
  address: CONTRACTS.memogentCore,
  abi: memogentCoreAbi,
  functionName: "depositSTT",
  value: parseEther("1.5"),
});
```

### 6.5 Deposit ERC-20 (approve → deposit, 2-step)

```tsx
// Step 1: approve
writeContract({
  address: tokenAddress,
  abi: erc20Abi,
  functionName: "approve",
  args: [CONTRACTS.memogentCore, amount],
});

// AFTER step 1 tx mines (use useWaitForTransactionReceipt):
writeContract({
  address: CONTRACTS.memogentCore,
  abi: memogentCoreAbi,
  functionName: "depositToken",
  args: [tokenAddress, amount],
});
```

UI: show "Step 1/2 Approving..." → "Step 2/2 Depositing..."

### 6.6 Dashboard reads (batched)

```tsx
import { useReadContracts } from "wagmi";

export function Dashboard({ user }: { user: `0x${string}` }) {
  const { data } = useReadContracts({
    contracts: [
      { address: CONTRACTS.memogentCore, abi: memogentCoreAbi, functionName: "getWillInfo", args: [user] },
      { address: CONTRACTS.memogentCore, abi: memogentCoreAbi, functionName: "getStatus", args: [user] },
      { address: CONTRACTS.memogentCore, abi: memogentCoreAbi, functionName: "vaultSTT", args: [user] },
      { address: CONTRACTS.memogentAgent, abi: memogentAgentAbi, functionName: "latestAssessment", args: [user] },
      { address: CONTRACTS.timeCapsule, abi: timeCapsuleAbi, functionName: "hasCapsule", args: [user] },
    ],
    query: { refetchInterval: 10_000 }, // poll every 10s
  });

  const [willInfo, status, sttBalance, latestAssess, hasCapsule] = data ?? [];
  // ... render
}
```

### 6.7 Live event subscriptions

```tsx
import { useWatchContractEvent } from "wagmi";

useWatchContractEvent({
  address: CONTRACTS.memogentAgent,
  abi: memogentAgentAbi,
  eventName: "RiskDecision",
  args: { user: connectedAddress },
  onLogs(logs) {
    const { classification, timestamp } = logs[0].args;
    toast.info(`AI decision: ${classification}`);
    queryClient.invalidateQueries({ queryKey: ["dashboard", connectedAddress] });
  },
});

useWatchContractEvent({
  address: CONTRACTS.memogentAgent,
  abi: memogentAgentAbi,
  eventName: "EmpathyMessageGenerated",
  args: { user: connectedAddress },
  onLogs(logs) {
    const { message } = logs[0].args;
    showEmpathyModal(message);
  },
});
```

---

## 7. Status mapping

`MemogentCore.getStatus(user)` returns a string. UI mapping:

| Status string | Badge color | Label | UI behavior |
|---|---|---|---|
| `"Active"` | green | "Active ✓" | Normal dashboard, show countdown |
| `"Warning"` | yellow | "Deadline approaching" | Highlight check-in CTA, show "X days until deadline" |
| `"Inactive"` | red | "Inactive — inheritance pending" | Read-only; show beneficiary, vault snapshot |

Plus an additional client-side state derived from `willInfo`:
- If `executed == true` → show "Inheritance Executed" with link to beneficiary's wallet on Shannon Explorer
- If `willInfo.owner == address(0)` → "No will yet" empty state with create CTA

```tsx
const STATUS_CONFIG = {
  Active:   { color: "green",  label: "Active ✓",                cta: "checkIn" },
  Warning:  { color: "yellow", label: "Deadline approaching",    cta: "checkIn" },
  Inactive: { color: "red",    label: "Inactive — inheritance pending", cta: null },
} as const;
```

---

## 8. AI activity panel — the agent-native pitch

**This is the most important UI section for judging criterion #2 (Agent-First Design).**

Make this prominent on the owner dashboard:

```
┌─────────────────────────────────────────────────────────┐
│  AI Risk Classification (latest)                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Classification:  SAFE  ✓                        │   │
│  │  Assessed:        5 minutes ago                  │   │
│  │  Signal context:  checkInAgeHours=2;             │   │
│  │                   walletTxAgeHours=1;            │   │
│  │                   tgLastSeenMin=15               │   │
│  │  [View on-chain tx ↗]                            │   │
│  │  [View AI receipt on Somnia ↗]                   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Classification History (last 14 days)                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  [Timeline chart: each dot is a classification]  │   │
│  │  SAFE  SAFE  SAFE  WATCH  SAFE  SAFE  ...        │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

Sources:
- Latest: `memogentAgent.latestAssessment(user)`
- History: query `AssessmentReceived` events from `memogentAgent` filtered by user (use `getLogs` or wagmi `useWatchContractEvent` + cache)
- Receipt link: `https://shannon-explorer.somnia.network/tx/{txHash}` for the `RiskDecision` event tx

**Render the context string** (`AssessmentRequestedWithContext.contextSummary`) — judges want to see what data the AI saw.

---

## 9. Empathy message UI — the differentiator

When `EmpathyMessageGenerated` fires for a wallet you're displaying (typically beneficiary view):

```tsx
const { data: empathyMsg } = useReadContract({
  address: CONTRACTS.memogentAgent,
  abi: memogentAgentAbi,
  functionName: "empathyMessages",
  args: [ownerAddress],
});

{empathyMsg && empathyMsg !== "" && (
  <Card className="border-purple-500 bg-purple-50">
    <CardHeader>💌 A final note from {ownerLabel}</CardHeader>
    <CardContent>
      <p className="italic font-serif text-lg leading-relaxed">{empathyMsg}</p>
      <p className="text-sm text-gray-500 mt-2">
        Generated by Memogent AI via Somnia LLM consensus
      </p>
    </CardContent>
  </Card>
)}
```

Polish: animated typewriter reveal on first display, dimmed border, slow fade-in. Sample real output from production:
> *"I hope this reaches you well. You've always been someone I trusted. Take care, and thank you for being here."*

---

## 10. Time Capsule UI

**IMPORTANT:** Memogent uses **Pinata + AES-256-GCM** for Time Capsule. NOT Lighthouse Kavach (encryption nodes blocked from some ISPs). The flow is:

### 10.1 Owner side — UPLOADING

The CLI `pnpm capsule-upload <file>` already exists in the agent repo. **For W4 / launch, you can build a web UI version OR redirect owners to use the CLI.**

If web UI:
```typescript
// Pseudocode for owner upload flow (Pinata API key needed on backend route)
// 1. User picks file
// 2. POST to /api/capsule/upload (backend handles Pinata)
// 3. Backend: read file → AES-256-GCM encrypt with random key → upload ciphertext to Pinata
// 4. Backend returns { cid, contentHash, encryptionKey }
// 5. FE calls TimeCapsule.attachCapsule(cid, contentHash, encryptionKey)
```

The backend route is needed because Pinata JWT must stay server-side. Reference implementation: `agent/src/cli/capsule-upload.ts` — port the logic to a Next.js API route.

### 10.2 Beneficiary side — CLAIMING

This part is fully browser-side (no API keys needed):

```tsx
import { useReadContract, useAccount } from "wagmi";

export function ClaimCapsulePage({ ownerAddress }: { ownerAddress: `0x${string}` }) {
  const { address: beneficiary } = useAccount();
  const [decrypted, setDecrypted] = useState<string | null>(null);

  // 1. Read capsule metadata
  const { data: capsule } = useReadContract({
    address: CONTRACTS.timeCapsule,
    abi: timeCapsuleAbi,
    functionName: "getCapsule",
    args: [ownerAddress],
  });

  // 2. Check if released (will executed)
  const { data: isReleased } = useReadContract({
    address: CONTRACTS.timeCapsule,
    abi: timeCapsuleAbi,
    functionName: "isReleased",
    args: [ownerAddress],
  });

  const handleClaim = async () => {
    if (!isReleased) return alert("Will not yet executed");
    if (!capsule || !capsule[0]) return alert("No capsule attached");

    const [cid, contentHash] = capsule;

    // 3. Fetch decryption key (reverts if not beneficiary or not released)
    const keyHex = await readContract(config, {
      address: CONTRACTS.timeCapsule,
      abi: timeCapsuleAbi,
      functionName: "getDecryptionKey",
      args: [ownerAddress],
      account: beneficiary,  // msg.sender for the view call
    });

    // 4. Fetch encrypted blob from Pinata gateway
    const resp = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
    const encryptedBlob = new Uint8Array(await resp.arrayBuffer());

    // 5. AES-256-GCM decrypt locally
    // Format: iv (12 bytes) || authTag (16 bytes) || ciphertext
    const iv = encryptedBlob.slice(0, 12);
    const authTag = encryptedBlob.slice(12, 28);
    const ciphertext = encryptedBlob.slice(28);
    const ciphertextWithTag = new Uint8Array([...ciphertext, ...authTag]);  // Web Crypto expects appended tag

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      Uint8Array.from(keyHex.slice(2).match(/.{2}/g)!.map(b => parseInt(b, 16))),
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      ciphertextWithTag
    );

    // 6. Verify integrity via keccak256(plaintext) == contentHash
    // (use viem.keccak256 for this)
    
    setDecrypted(new TextDecoder().decode(plaintext));
  };

  if (!isReleased) {
    return <div>This capsule is not yet released. It unlocks after the will executes.</div>;
  }

  return (
    <div>
      <Button onClick={handleClaim}>🔓 Decrypt and Open</Button>
      {decrypted && (
        <div className="mt-4 p-4 border rounded">
          <pre className="whitespace-pre-wrap">{decrypted}</pre>
        </div>
      )}
    </div>
  );
}
```

**Notes:**
- The CID is public on-chain. Anyone can fetch the ciphertext. Only the beneficiary can fetch the key.
- For non-text files (images, video, PDFs), wrap the decrypted Uint8Array in a Blob with detected MIME type and create object URL for `<img>` / `<video>` / `<embed>`.
- **MVP limitation to disclose in UI:** AES key is technically readable via `eth_getStorageAt` (raw storage slot access). Production would use Lit Protocol threshold encryption. Adequate for hackathon demo.

---

## 11. Telegram linking — SIWE deep-link

Bot username: `@memogent_v1_bot`

**Backend route needed:** `app/api/telegram/link/route.ts`

```typescript
// app/api/telegram/link/route.ts
import { SiweMessage } from "siwe";
import { supabase } from "@/lib/supabase-server";  // service_role key, server-side only
import crypto from "node:crypto";

export async function POST(req: Request) {
  const { walletAddress, signature, message } = await req.json();

  // 1. Verify SIWE signature
  const siwe = new SiweMessage(message);
  const { data, success } = await siwe.verify({ signature });
  if (!success) return Response.json({ error: "invalid signature" }, { status: 401 });
  if (data.address.toLowerCase() !== walletAddress.toLowerCase()) {
    return Response.json({ error: "address mismatch" }, { status: 401 });
  }

  // 2. Issue link token (10 min TTL)
  const token = `link_${crypto.randomBytes(16).toString("hex")}`;
  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + 10 * 60 * 1000;

  const { error } = await supabase.from("link_token").insert({
    token, wallet_address: walletAddress, nonce, expires_at: expiresAt
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ token });
}
```

**FE component:**

```tsx
import { SiweMessage } from "siwe";
import { useAccount, useSignMessage } from "wagmi";

export function LinkTelegramButton() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const handleLink = async () => {
    if (!address) return;

    const nonce = crypto.randomUUID();
    const siwe = new SiweMessage({
      domain: window.location.host,
      address,
      statement: "Link Telegram for Memogent life-proof signal",
      uri: window.location.origin,
      version: "1",
      chainId: 50312,
      nonce,
      issuedAt: new Date().toISOString(),
    });

    const message = siwe.prepareMessage();
    const signature = await signMessageAsync({ message });

    const res = await fetch("/api/telegram/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: address, signature, message }),
    });
    const { token } = await res.json();

    window.open(`https://t.me/memogent_v1_bot?start=${token}`, "_blank");
  };

  return <Button onClick={handleLink}>Link Telegram</Button>;
}
```

**Check link status:**

```typescript
async function getLinkStatus(wallet: string) {
  const { data } = await supabase
    .from("wallet_link")
    .select("chat_id, linked_at, last_seen_at")
    .eq("wallet_address", wallet)
    .maybeSingle();
  return data; // null if not linked
}
```

---

## 12. Error handling

### Common contract errors

| Revert reason | When | UI message |
|---|---|---|
| `Memogent: Will already registered` | Try to register twice | "You already have an active will. Withdraw + deactivate first" |
| `Memogent: Beneficiary cannot be the same as owner` | beneficiary == msg.sender | "Beneficiary must be a different address" |
| `Memogent: Invalid beneficiary address` | beneficiary == 0x0 | "Enter a valid address" |
| `Memogent: No will found` | call function without registered will | "Create a will first" |
| `Memogent: Will is not active` | call modifier on inactive will | "Will is inactive (executed or deactivated)" |
| `Memogent: Will already executed` | call modifier on executed will | "Inheritance has already executed" |
| `Memogent: Amount must be greater than 0` | depositSTT with msg.value=0 | "Enter a non-zero amount" |
| `Memogent: not deployer` | non-deployer calls setAgentAuthority | should not happen via FE |
| `Memogent: not agent` | non-agent-authority calls executeFromAgent | should not happen via FE |
| `MemogentAgent: cooldown active` | assessRisk within 60 min of last call | "Recently assessed. Try again in X minutes" |
| `MemogentAgent: will inactive` | assessRisk on inactive will | "Cannot assess: will not active" |
| `MemogentAgent: insufficient deposit` | sent < 0.30 STT | "Send at least 0.4 STT for assessment" |
| `TimeCapsule: not beneficiary` | non-beneficiary calls getDecryptionKey | "Only the named beneficiary can decrypt" |
| `TimeCapsule: not yet released` | call getDecryptionKey before execution | "Capsule unlocks only after will executes" |
| `TimeCapsule: no will` | attachCapsule without a will | "Create a will first" |
| `TimeCapsule: message already generated` | generateEmpathyMessage twice | "AI message already created — refresh" |

### Wallet errors (handle with RainbowKit defaults)

- User rejected (4001): silent (no toast)
- Insufficient funds: "Not enough STT for gas. Get more from the faucet."
- Wrong chain: RainbowKit prompts switch automatically

---

## 13. Security gotchas — DO NOT VIOLATE

1. **NEVER store private keys** anywhere in FE. All signing via wagmi.
2. **NEVER expose `SUPABASE_SERVICE_ROLE_KEY`** in `NEXT_PUBLIC_*` env vars. Only the `anon` key is browser-safe.
3. **NEVER expose `PINATA_JWT`** in FE. Only the backend `/api/capsule/upload` route uses it.
4. **NEVER call `getDecryptionKey` server-side** — the access check uses `msg.sender == beneficiary`. Server-side calls would not have the beneficiary's signature; you'd need to use `account` override in viem to set the simulated caller for view calls only (read-only, no risk).
5. **Validate addresses** with `isAddress(input)` from viem before passing to `writeContract`.
6. **SIWE replay protection**: always include unique nonce per linking attempt. Server must reject reused nonces.
7. **Sanitize CIDs** before rendering as links — match against IPFS CID regex.
8. **chainId in SIWE**: use `50312`. If user signs from another chain, message clarity helps users.

---

## 14. Pages structure (suggested)

```
app/
├── layout.tsx                    Providers wrapper + global nav
├── page.tsx                      Landing (marketing + connect)
├── onboard/
│   ├── create/page.tsx           Step 1: register will
│   ├── deposit/page.tsx          Step 2: deposit STT/tokens/NFT
│   ├── telegram/page.tsx         Step 3: link Telegram (SIWE + deep-link)
│   └── capsule/page.tsx          Step 4: optional — upload Time Capsule
├── dashboard/page.tsx            Main owner dashboard (check-in, status, AI panel, capsule status)
├── history/page.tsx              AI decision history timeline + receipts
├── claim/[owner]/page.tsx        Beneficiary claim page (capsule decrypt + view inheritance)
├── audit/[user]/page.tsx         Public read-only audit view
└── api/
    ├── telegram/
    │   ├── link/route.ts         Issue link_token after SIWE verify
    │   └── status/route.ts       Check if wallet is linked
    └── capsule/
        └── upload/route.ts       Backend Pinata upload (server holds Pinata JWT)
```

---

## 15. Coordination with team

### What SC/Agent team delivers to you

| When | What |
|---|---|
| ✅ Done (W3) | All 4 contracts deployed + verified on Shannon Explorer |
| ✅ Done (W3) | Off-chain agent running 24/7 — your dashboard shows real autonomous decisions |
| ✅ Done (W3) | Supabase schema + populated tables |
| ✅ Done (W3) | CLI tools (issue-token, capsule-upload, capsule-claim) — reference implementations |
| W4 | RLS policies on Supabase for `anon` role |
| W4 | Polished README + demo script (for Jeje) |

### What you deliver

| When | What |
|---|---|
| W3-W4 | Connect wallet + status display working against live contracts |
| W3-W4 | Onboarding flow (create will, deposit, link Telegram) |
| W4 | AI panel — show classifications + empathy message + receipts |
| W4 | Capsule UI (owner upload + beneficiary claim) |
| W4 | Final polish + demo recording with Jeje |

### Communication

- ABI changes or new events → ping in shared chat
- Contract bug repro: include chain (50312), tx hash, expected vs actual
- Reference `docs/flow.md` first for system questions

---

## 16. Hackathon-critical reminders

1. **Demo on Somnia Testnet only** (chain 50312). Never deploy FE pointing to mainnet during programme.
2. **Make AI decisions visible.** Classifications, empathy message, signal context — surface them prominently. This is what wins criterion #2 (Agent-First Design).
3. **The check-in button** must be the most prominent UI element. Judges will demo this.
4. **Capsule decrypt flow** must work in under 10 seconds. Practice with real CID.
5. **Empathy message** is the emotional moment of the demo. Render it beautifully (serif font, italic, slow reveal).
6. **Mobile viewport** matters less — desktop demo is fine.
7. **Keep it simple** — judges look at 4 criteria. A clean 6-screen UX beats a 20-screen labyrinth.

---

## 17. Useful URLs

| Topic | URL |
|---|---|
| Shannon Explorer (verify contracts) | https://shannon-explorer.somnia.network |
| Somnia testnet faucet | https://testnet.somnia.network/ |
| Wagmi docs | https://wagmi.sh |
| Viem docs | https://viem.sh |
| RainbowKit docs | https://www.rainbowkit.com/docs |
| Next.js App Router | https://nextjs.org/docs/app |
| shadcn/ui | https://ui.shadcn.com |
| SIWE spec | https://eips.ethereum.org/EIPS/eip-4361 |
| Supabase JS | https://supabase.com/docs/reference/javascript |
| Pinata Gateway pattern | `https://gateway.pinata.cloud/ipfs/{cid}` |
| Memogent GitHub | https://github.com/alventendrawan123/memogent |
| Telegram Bot | https://t.me/memogent_v1_bot |

---

*Last updated 2026-05-25 (commit `b18e49a`). Update when new contracts deploy or when libraries pinning changes. Source of truth for FE conventions.*
