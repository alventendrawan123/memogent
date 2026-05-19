# Frontend Guide for Bima — Memogent

> **Single source of truth for the Memogent frontend.** Read this end-to-end before writing code.
> Update as needed during W2-W4 in sync with smart contract deployments.

---

## 0. Your scope

Bima, **you own everything under `d:\memogent\frontend\`**. The smart-contract team (user/Alven) and AI-agent team (user/Alven) do NOT touch this directory.

You read FROM:
- `docs/flow.md` — full system flow (read this first)
- `sc/rules/` — to understand contract behavior
- `skill/somnia/skill.md` — network info, agent platform, receipts
- `skill/telegram/skill.md` — SIWE + deep-link binding pattern
- `skill/ipfs/skill.md` — Lighthouse Kavach for capsule client-side

You do NOT need to read:
- `sc/src/` — implementation details (you only need ABIs)
- `agent/src/` — off-chain agent runs server-side

---

## 1. Project context (60-second briefing)

**Memogent** = autonomous digital legacy guardian on Somnia. Users register a will, deposit assets, and link multi-signal life proofs (wallet activity, Telegram, check-ins). When inactivity is suspected, on-chain AI agents (Somnia LLM Inference + JSON API Request) analyze signals, classify risk, and execute inheritance.

**For the FE specifically**, this means you build:
1. **Landing + onboarding** — wallet connect, create will, deposit assets
2. **Owner dashboard** — status, risk score, decision history, check-in button, agent receipts
3. **Telegram linking page** — SIWE signing + deep-link to `@MemogentBot`
4. **Capsule creation page** — encrypted upload via Lighthouse Kavach
5. **Beneficiary claim page** — decrypt capsule once `WillExecuted` fires
6. **Public audit page** (optional) — anyone can view a user's decision history with receipt links

**Hackathon judging criteria you affect directly:**
- **Functionality** — the FE must work reliably during demo
- **Agent-First Design** — show the agent receipts prominently; link to `agents.somnia.network/receipts/<id>`
- **Autonomous Performance** — the dashboard makes the AI's autonomy visible

---

## 2. Tech stack — recommended

You're free to pick UI libraries, but Web3/Lighthouse integration patterns below assume specific libraries. Stay close to these unless you have strong reason.

| Layer | Pick | Why |
|---|---|---|
| Framework | **Next.js 14+** (App Router) | confirmed in tech stack memory |
| Wallet connect | **RainbowKit** + **wagmi v2** | best wallet UX, handles chain switching to Somnia |
| EVM client | **viem** (via wagmi) | wagmi peer dep; can also use `ethers v6` for ABI helpers |
| Styling | **Tailwind CSS** + **shadcn/ui** | fast hackathon UI |
| State | wagmi's built-in React hooks + minimal `useState`/`useReducer` | no need for Redux |
| IPFS client | **@lighthouse-web3/sdk** | for capsule operations |
| SIWE | **siwe** library | EIP-4361 implementation |
| Charts | **Recharts** | for risk score over time |
| Forms | **react-hook-form** + **zod** | validation |
| Date display | **date-fns** | format timestamps |

```bash
pnpm add next react react-dom
pnpm add wagmi viem @tanstack/react-query
pnpm add @rainbow-me/rainbowkit
pnpm add @lighthouse-web3/sdk
pnpm add siwe
pnpm add react-hook-form zod @hookform/resolvers
pnpm add date-fns recharts
pnpm add tailwindcss @tailwindcss/forms
```

---

## 3. Network configuration

### Somnia Testnet (Memogent default)

```typescript
// lib/chains.ts
import { defineChain } from "viem";

export const somniaTestnet = defineChain({
    id: 50312,
    name: "Somnia Testnet",
    nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
    rpcUrls: {
        default: { http: ["https://api.infra.testnet.somnia.network/"] },
        public: { http: ["https://dream-rpc.somnia.network"] }, // legacy fallback
    },
    blockExplorers: {
        default: {
            name: "Shannon Explorer",
            url: "https://shannon-explorer.somnia.network",
        },
        social: {
            name: "SocialScan",
            url: "https://somnia-testnet.socialscan.io",
        },
    },
    testnet: true,
});
```

### wagmi + RainbowKit setup

```typescript
// lib/wagmi.ts
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { somniaTestnet } from "./chains";
import { http } from "viem";

export const wagmiConfig = getDefaultConfig({
    appName: "Memogent",
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
    chains: [somniaTestnet],
    transports: {
        [somniaTestnet.id]: http("https://api.infra.testnet.somnia.network/"),
    },
    ssr: true,
});
```

```typescript
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

### Faucet

User without STT? Direct them to `https://testnet.somnia.network/` (primary faucet).

---

## 4. Contract addresses + ABIs

**Addresses will be filled in after W1 deployment.** Until then, use `0x0000...0000` placeholders and toggle via env vars.

```typescript
// lib/contracts.ts
export const CONTRACTS = {
    memogentCore:    process.env.NEXT_PUBLIC_MEMOGENT_CORE    as `0x${string}`,
    memogentAgent:   process.env.NEXT_PUBLIC_MEMOGENT_AGENT   as `0x${string}`,
    agentVault:      process.env.NEXT_PUBLIC_AGENT_VAULT      as `0x${string}`,
    timeCapsule:     process.env.NEXT_PUBLIC_TIME_CAPSULE     as `0x${string}`,
    somniaAgents:    "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776", // testnet platform
} as const;
```

### Getting ABIs

After SC team compiles:
```bash
# In sc/ directory
forge build

# ABIs land in: sc/out/<ContractName>.sol/<ContractName>.json
# The "abi" field is what you need
```

**Manual sync step:** copy each contract's `abi` array into `frontend/src/abi/<ContractName>.ts`:

```typescript
// frontend/src/abi/MemogentCore.ts
export const memogentCoreAbi = [
    // ... paste abi array from sc/out/MemogentCore.sol/MemogentCore.json
] as const;
```

**Automate later (W3):** a script `scripts/sync-abi.ts` that reads `sc/out/` and generates these files.

---

## 5. Contract behavior — what to call

### 5.1 MemogentCore (will + vault state)

**Write functions** users trigger:

| Function | When |
|---|---|
| `registerWill(address beneficiary, uint256 inactivePeriodSec)` | Create will (one-time per address) |
| `checkIn()` | User confirms they're alive — resets deadline |
| `depositSTT() payable` | Deposit native token |
| `depositToken(address token, uint256 amount)` | Deposit ERC-20 (needs prior `approve`) |
| `depositNFT(address nft, uint256 tokenId)` | Deposit NFT (needs prior `setApprovalForAll`) |
| `withdraw()` | Owner pulls all vault assets back (while will still active) |
| `updateBeneficiary(address newBeneficiary)` | Change beneficiary |
| `updateInactivePeriod(uint256 newPeriodSec)` | Extend/shorten inactive window |
| `deactivate()` | Permanently disable will + return all assets |

**Read functions** for dashboard:

| Function | Returns |
|---|---|
| `willInfo(address user)` | `{beneficiary, lastCheckIn, deadlineMs, inactivePeriod, executed, active}` |
| `getStatus(address user)` | `"Active" \| "Warning" \| "Grace" \| "Inactive" \| "Executed"` |
| `vaultSTT(address user)` | uint256 wei balance |
| `getCheckInHistory(address user)` | `Array<{timestamp, blockNumber}>` |
| `getVaultHistory(address user)` | `Array<{actType, asset, amount, timestamp, blockNumber}>` |

**Events to subscribe:**
- `WillRegistered(address indexed owner, address indexed beneficiary, uint256 deadlineMs)`
- `CheckedIn(address indexed owner, uint256 newDeadlineMs)`
- `DepositSTT(address indexed owner, uint256 amount)`
- `DepositToken(address indexed owner, address indexed token, uint256 amount)`
- `DepositNFT(address indexed owner, address indexed nftContract, uint256 tokenId)`
- `Withdrawn(address indexed owner, uint256 sttAmount)`
- `BeneficiaryUpdated(address indexed owner, address indexed newBeneficiary)`
- `WillDeactivated(address indexed owner)`
- `WillExecuted(address indexed owner, address indexed beneficiary, uint256 executedAt)`

### 5.2 MemogentAgent (AI decisions)

**Read functions** for dashboard "AI Decision History":

| Function | Returns |
|---|---|
| `latestDecision(address user)` | `AgentDecisionReceipt` struct (latest entry) |
| `decisionHistory(address user)` | `Array<AgentDecisionReceipt>` (all decisions, oldest first) |
| `pendingAssessment(address user)` | `bool` (true if waiting for agent callback) |

**`AgentDecisionReceipt` struct:**
```typescript
{
    user: `0x${string}`,
    timestamp: bigint,              // unix seconds
    riskScore: number,              // 0-100
    riskTag: 0 | 1 | 2 | 3,          // SAFE | WATCH | GRACE | EXECUTE
    reasoningHash: `0x${string}`,
    agentRequestIds: bigint[],      // ⩾2 (json api) + ⩾2 (llm) = 4+ requestIds
    signalSnapshot: {
        wallet: number,              // 0-100 normalized
        checkin: number,
        telegram: number,
        weights: { wallet: number, checkin: number, telegram: number },
    },
}
```

**Events to subscribe** (THIS IS THE KEY UI EVENT):
- `RiskDecision(address indexed user, uint8 tag, uint8 score, bytes32 reasoningHash, uint256[] requestIds)` — fires when AI decision finalized
- `AgentRequestCreated(uint256 indexed requestId, address indexed user, uint256 agentId, bytes32 payloadHash)` — for "agent is thinking" indicator
- `AgentRequestFailed(uint256 indexed requestId, address indexed user, uint8 status)` — for error display

### 5.3 AgentVault (multi-stage release)

**Read:**
| Function | Returns |
|---|---|
| `dailyReleased(address user)` | uint256 — STT released today |
| `weeklyReleased(address user)` | uint256 |
| `dailyBps(address user)` | uint16 — basis points limit (e.g. 1000 = 10%) |
| `currentStage(address user)` | uint8 — 0 (not started), 1, 2, or 3 |

**Events:**
- `VaultStageReleased(address indexed user, uint8 stage, uint256 amount, bytes32 reasonHash)`
- `GraceStarted(address indexed user, uint256 graceEndsAt)`

### 5.4 TimeCapsule

**Write:**
| Function | When |
|---|---|
| `registerCapsule(string calldata cid, address beneficiary)` | After Lighthouse upload succeeds |

**Read:**
| Function | Returns |
|---|---|
| `capsuleInfo(address testator)` | `{testator, beneficiary, cid, createdAt, released}` |

**Events:**
- `CapsuleRegistered(address indexed testator, address indexed beneficiary, string cid)`
- `CapsuleReleased(address indexed testator, address indexed beneficiary, string cid)`

---

## 6. User flows — code patterns

### 6.1 Connect wallet + force Somnia Testnet

Use RainbowKit's `<ConnectButton />`. wagmi will auto-prompt user to switch to Somnia if they're on wrong chain.

```tsx
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useChainId } from "wagmi";
import { somniaTestnet } from "@/lib/chains";

export function NavBar() {
    const chainId = useChainId();
    const wrongChain = chainId !== somniaTestnet.id;
    return (
        <nav className="...">
            {wrongChain && <Banner>Please switch to Somnia Testnet</Banner>}
            <ConnectButton />
        </nav>
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
        const periodSec = BigInt(days * 86400);
        writeContract({
            address: CONTRACTS.memogentCore,
            abi: memogentCoreAbi,
            functionName: "registerWill",
            args: [beneficiary, periodSec],
        });
    };

    return <form>{/* ... */}</form>;
}
```

### 6.3 Check in (the most important button on the dashboard)

```tsx
const { writeContract } = useWriteContract();

const handleCheckIn = () => {
    writeContract({
        address: CONTRACTS.memogentCore,
        abi: memogentCoreAbi,
        functionName: "checkIn",
    });
};

<Button
    onClick={handleCheckIn}
    className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg"
>
    ✅ I'm alive — Check In
</Button>
```

After successful tx, the wagmi `useWaitForTransactionReceipt` hook tells you when it's mined. Refresh `willInfo` after.

### 6.4 Deposit STT

```tsx
import { parseEther } from "viem";

writeContract({
    address: CONTRACTS.memogentCore,
    abi: memogentCoreAbi,
    functionName: "depositSTT",
    value: parseEther("1.5"),  // 1.5 STT
});
```

### 6.5 Deposit ERC-20 (2-step: approve → deposit)

```tsx
// Step 1: Approve
writeContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "approve",
    args: [CONTRACTS.memogentCore, parseUnits("100", decimals)],
});

// AFTER approve tx is mined:
writeContract({
    address: CONTRACTS.memogentCore,
    abi: memogentCoreAbi,
    functionName: "depositToken",
    args: [tokenAddress, parseUnits("100", decimals)],
});
```

Wait for receipt between the two — don't fire them back-to-back. UI pattern: show "Step 1/2 Approving..." → "Step 2/2 Depositing..."

### 6.6 Read user dashboard data

```tsx
import { useReadContracts } from "wagmi";

export function Dashboard({ user }: { user: `0x${string}` }) {
    const { data, isLoading } = useReadContracts({
        contracts: [
            { address: CONTRACTS.memogentCore, abi: memogentCoreAbi, functionName: "willInfo", args: [user] },
            { address: CONTRACTS.memogentCore, abi: memogentCoreAbi, functionName: "getStatus", args: [user] },
            { address: CONTRACTS.memogentCore, abi: memogentCoreAbi, functionName: "vaultSTT", args: [user] },
            { address: CONTRACTS.memogentAgent, abi: memogentAgentAbi, functionName: "latestDecision", args: [user] },
        ],
        query: { refetchInterval: 10_000 }, // poll every 10s for fresh state
    });

    const [will, status, sttBalance, latestDecision] = data ?? [];
    // ... render
}
```

### 6.7 Subscribe to events (live updates)

```tsx
import { useWatchContractEvent } from "wagmi";

useWatchContractEvent({
    address: CONTRACTS.memogentAgent,
    abi: memogentAgentAbi,
    eventName: "RiskDecision",
    args: { user: connectedAddress },
    onLogs(logs) {
        // Show toast: "AI just decided: GRACE (score 82). Click for details."
        toast.info(`AI decision: ${tagName(logs[0].args.tag)} (score ${logs[0].args.score})`);
        // Trigger refetch of decisionHistory
        queryClient.invalidateQueries({ queryKey: ["decisionHistory", connectedAddress] });
    },
});
```

---

## 7. Telegram linking flow

**Backend route required:** create `app/api/telegram/link/route.ts` that:
1. Receives `{ walletAddress, signature, nonce }` from FE
2. Verifies the SIWE signature
3. Issues an opaque `link_<uuid>` token (5-min TTL)
4. Calls the agent API (or shared SQLite) to persist the token
5. Returns the token to FE

**FE flow:**

```tsx
import { SiweMessage } from "siwe";
import { useSignMessage } from "wagmi";

export function LinkTelegramButton({ walletAddress }: { walletAddress: `0x${string}` }) {
    const { signMessageAsync } = useSignMessage();

    const handleLink = async () => {
        // 1. Build SIWE message
        const nonce = crypto.randomUUID();
        const siwe = new SiweMessage({
            domain: window.location.host,
            address: walletAddress,
            statement: "Link Telegram for Memogent life-proof",
            uri: window.location.origin,
            version: "1",
            chainId: 50312,
            nonce,
            issuedAt: new Date().toISOString(),
        });

        // 2. User signs
        const message = siwe.prepareMessage();
        const signature = await signMessageAsync({ message });

        // 3. Submit to our backend → returns link token
        const res = await fetch("/api/telegram/link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ walletAddress, signature, nonce, message }),
        });
        const { token } = await res.json();

        // 4. Deep-link to Telegram bot
        window.open(`https://t.me/MemogentBot?start=${token}`, "_blank");
    };

    return <Button onClick={handleLink}>Link Telegram</Button>;
}
```

**Bot username:** confirm with team — will be `@MemogentBot` or `@MemogentLifeBot` (TBD before Workshop 1).

**Verifying link status:** poll `GET /api/telegram/status?wallet=<addr>` → returns `{ linked: bool, lastSeenAt: number }`.

---

## 8. Time Capsule — upload (testator side)

**Capsule is encrypted CLIENT-SIDE before upload.** This is critical — never send plaintext to the server.

```tsx
import lighthouse from "@lighthouse-web3/sdk";
import { useWalletClient } from "wagmi";
import { useWriteContract } from "wagmi";

export function CapsuleUploadForm({ beneficiary }: { beneficiary: `0x${string}` }) {
    const { data: walletClient } = useWalletClient();
    const { writeContract } = useWriteContract();
    const apiKey = process.env.NEXT_PUBLIC_LIGHTHOUSE_API_KEY!;

    const handleUpload = async (file: File) => {
        if (!walletClient) return;
        const testator = walletClient.account.address;

        // 1. Get Lighthouse auth message (rotates daily)
        const authMessage = (await lighthouse.getAuthMessage(testator)).data.message;

        // 2. Sign auth message via wallet
        const signature = await walletClient.signMessage({ message: authMessage });

        // 3. Upload encrypted (Kavach handles symmetric key)
        const upload = await lighthouse.uploadEncrypted(
            file,
            apiKey,
            testator,
            signature
        );
        const cid = upload.data[0].Hash;

        // 4. Grant beneficiary access (NO prior beneficiary participation needed)
        await lighthouse.shareFile(testator, [beneficiary], cid, signature);

        // 5. Register on-chain
        writeContract({
            address: CONTRACTS.timeCapsule,
            abi: timeCapsuleAbi,
            functionName: "registerCapsule",
            args: [cid, beneficiary],
        });
    };

    return <form>{/* file input */}</form>;
}
```

**Critical:**
- The API key is a NEXT_PUBLIC env var because Lighthouse free-tier API keys are publishable. For Beacon+ tier in production, route through your backend.
- File size limit: 50 MB on free tier.
- File metadata (filename, MIME type) is NOT encrypted — don't put PII in filename.

---

## 9. Time Capsule — claim (beneficiary side)

Beneficiary visits `/claim/<testator-address>`:

```tsx
import lighthouse from "@lighthouse-web3/sdk";
import { useReadContract, useWalletClient } from "wagmi";

export function ClaimPage({ testator }: { testator: `0x${string}` }) {
    const { data: capsule } = useReadContract({
        address: CONTRACTS.timeCapsule,
        abi: timeCapsuleAbi,
        functionName: "capsuleInfo",
        args: [testator],
    });

    const { data: walletClient } = useWalletClient();
    const [decrypted, setDecrypted] = useState<Blob | null>(null);

    const handleClaim = async () => {
        if (!walletClient || !capsule || !capsule.released) return;
        const beneficiary = walletClient.account.address;

        // Verify beneficiary address matches
        if (beneficiary.toLowerCase() !== capsule.beneficiary.toLowerCase()) {
            toast.error("Only the designated beneficiary can claim this capsule.");
            return;
        }

        // 1. Beneficiary signs Lighthouse auth (FIRST interaction with Kavach for them)
        const authMessage = (await lighthouse.getAuthMessage(beneficiary)).data.message;
        const signature = await walletClient.signMessage({ message: authMessage });

        // 2. Fetch decryption key from Kavach threshold network
        const keyData = await lighthouse.fetchEncryptionKey(
            capsule.cid,
            beneficiary,
            signature
        );

        // 3. Decrypt
        const decryptedBlob = await lighthouse.decryptFile(capsule.cid, keyData.data.key);
        setDecrypted(decryptedBlob);
    };

    if (!capsule?.released) {
        return <div>This capsule is not yet released. It unlocks when the will executes.</div>;
    }

    return (
        <div>
            <Button onClick={handleClaim}>Decrypt and Open</Button>
            {decrypted && <FileViewer blob={decrypted} />}
        </div>
    );
}
```

**Show `FileViewer` based on detected MIME type:**
- text/*: render as `<pre>`
- image/*: `<img src={URL.createObjectURL(blob)} />`
- video/*: `<video controls>`
- application/pdf: `<embed>`
- else: download link

---

## 10. Status display rules

Status string from `MemogentCore.getStatus(user)` → UI mapping:

| Status | Badge color | Label | UI behavior |
|---|---|---|---|
| `"Active"` | green | "Active ✓" | Normal dashboard; show next deadline + countdown |
| `"Warning"` | yellow | "Deadline approaching" | Highlight check-in button; show "X days until deadline" |
| `"Grace"` | orange | "Grace period" | Big check-in CTA; show graceEndsAt countdown |
| `"Inactive"` | gray | "Deactivated" | Read-only mode; show "Will was deactivated by owner" |
| `"Executed"` | red | "Inheritance executed" | Show beneficiary received assets; link to vault history |

```tsx
const STATUS_CONFIG = {
    Active:   { color: "green",  label: "Active ✓",            cta: "checkIn" },
    Warning:  { color: "yellow", label: "Deadline approaching", cta: "checkIn" },
    Grace:    { color: "orange", label: "Grace period",         cta: "checkIn" },
    Inactive: { color: "gray",   label: "Deactivated",          cta: null     },
    Executed: { color: "red",    label: "Inheritance executed", cta: null     },
} as const;
```

---

## 11. Risk score visualization — IMPORTANT for judging

This is **the most agent-native UI element**. Judges will look at this. Make it prominent.

Show on dashboard:
1. **Latest risk score** (large, with tag color)
2. **Risk score timeline** (line chart of last 30 days)
3. **Signal breakdown** (3 bars: wallet/checkin/telegram, each weighted)
4. **AI reasoning link** — link to Somnia receipt URL for the LATEST decision

```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";

export function RiskScoreCard({ user }: { user: `0x${string}` }) {
    const { data: history } = useReadContract({
        address: CONTRACTS.memogentAgent,
        abi: memogentAgentAbi,
        functionName: "decisionHistory",
        args: [user],
    });

    const latest = history?.[history.length - 1];

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <span className="text-5xl font-bold">{latest?.riskScore}</span>
                    <Badge color={tagColor(latest?.riskTag)}>{tagName(latest?.riskTag)}</Badge>
                </div>
                <a
                    href={`https://agents.somnia.network/receipts/${latest?.agentRequestIds[0]}`}
                    target="_blank"
                    className="text-sm text-blue-500 underline"
                >
                    View AI reasoning →
                </a>
            </CardHeader>
            <CardContent>
                <LineChart data={history?.map(h => ({ time: Number(h.timestamp), score: h.riskScore }))}>
                    <XAxis dataKey="time" tickFormatter={(t) => formatDate(t)} />
                    <YAxis domain={[0, 100]} />
                    <Line dataKey="score" />
                    <Tooltip />
                </LineChart>
            </CardContent>
        </Card>
    );
}

const tagName = (t: number) => ["SAFE", "WATCH", "GRACE", "EXECUTE"][t];
const tagColor = (t: number) => ["green", "yellow", "orange", "red"][t];
```

---

## 12. Audit trail — receipt rendering

Every `AgentDecisionReceipt` has `agentRequestIds: bigint[]` (usually 4 IDs — 2 JSON API + 2 LLM).

For each ID, link to:
- `https://agents.somnia.network/receipts/{requestId}` — public receipt viewer
- The on-chain tx for the `createRequest` call (look up via `AgentRequestCreated` event)
- The on-chain tx for the `handleResponse` callback (look up via `AgentResponseReceived` event)

```tsx
export function DecisionReceiptDetail({ receipt }: { receipt: AgentDecisionReceipt }) {
    return (
        <div className="space-y-2">
            <h3>Decision: {tagName(receipt.riskTag)} (score {receipt.riskScore})</h3>
            <p>Time: {formatDateTime(Number(receipt.timestamp))}</p>
            <p>Reasoning hash: <code>{receipt.reasoningHash}</code></p>

            <h4>Validator consensus on {receipt.agentRequestIds.length} agent calls:</h4>
            <ul>
                {receipt.agentRequestIds.map((id, i) => (
                    <li key={i}>
                        <a
                            href={`https://agents.somnia.network/receipts/${id}`}
                            target="_blank"
                            className="text-blue-500 underline"
                        >
                            Agent call #{i + 1} — receipt {id.toString().slice(0, 8)}...
                        </a>
                    </li>
                ))}
            </ul>

            <h4>Signal snapshot at decision time:</h4>
            <div className="grid grid-cols-3 gap-2">
                <SignalBar label="Wallet"   value={receipt.signalSnapshot.wallet}   weight={receipt.signalSnapshot.weights.wallet} />
                <SignalBar label="Check-in" value={receipt.signalSnapshot.checkin}  weight={receipt.signalSnapshot.weights.checkin} />
                <SignalBar label="Telegram" value={receipt.signalSnapshot.telegram} weight={receipt.signalSnapshot.weights.telegram} />
            </div>
        </div>
    );
}
```

**This is the core "agent-native" visual.** A judge clicking through these links should land on Somnia's own UI showing the actual LLM prompt, response, and validator signatures.

---

## 13. Error handling

### 13.1 Common contract errors

| Error string | When | UI message |
|---|---|---|
| `Core_AlreadyRegistered` | User tries to register twice | "You already have an active will. Deactivate it first." |
| `Core_InvalidBeneficiary` | Beneficiary is 0x0 or self | "Please enter a valid beneficiary address (not your own)." |
| `Core_NoWillFound` | User calls function without a will | "Create a will first." |
| `Core_GracePeriodActive` | User tries to modify during grace | "Your will is in grace period. Confirm you're alive first." |
| `Agent_NotAuthorized` | Direct call to agent functions | should never happen on FE |
| `Vault_DailyLimitExceeded` | Vault tried to release > daily bps | "Daily release limit reached. More assets will release tomorrow." |

```tsx
const ERROR_MESSAGES: Record<string, string> = {
    Core_AlreadyRegistered: "You already have an active will.",
    Core_InvalidBeneficiary: "Beneficiary address is invalid.",
    // ...
};

function getReadableError(err: unknown): string {
    if (!err) return "Unknown error";
    const msg = (err as Error).message ?? "";
    for (const [key, friendly] of Object.entries(ERROR_MESSAGES)) {
        if (msg.includes(key)) return friendly;
    }
    return msg.slice(0, 200);  // truncate raw error
}
```

### 13.2 Wallet errors

- **User rejected** (4001) — silent (no toast)
- **Insufficient funds** — "Not enough STT for gas. Get more from the faucet."
- **Network mismatch** — RainbowKit handles via the "Switch network" prompt

### 13.3 Lighthouse errors

- Upload failed — show retry button (3× max with backoff)
- Decrypt failed — "You may not be the designated beneficiary, or the capsule isn't released yet."

---

## 14. UI state checklist

For every page, ensure these states are covered:

| State | What to show |
|---|---|
| Not connected | Hero + ConnectButton |
| Connected, wrong chain | "Switch to Somnia Testnet" prompt |
| Connected, no will | Empty state with "Create your first will" CTA |
| Connected, has will, status=Active | Full dashboard |
| Connected, has will, status=Warning/Grace | Highlighted check-in CTA |
| Connected, has will, status=Executed | Read-only history view |
| Pending tx | Show pending state with spinner; disable buttons |
| Tx success | Toast + auto-refresh data |
| Tx failure | Toast with readable error |
| Pending agent assessment | "AI is analyzing... (~30s)" indicator |
| Agent assessment failed | Show the failure event + retry option |

---

## 15. Security gotchas — DO NOT VIOLATE

1. **NEVER store private keys** anywhere in the frontend. All signing goes through wagmi/RainbowKit.
2. **NEVER paste user input directly into Lighthouse API calls** — sanitize file names (length cap, char filter).
3. **NEVER trust client-side capsule access checks** — Kavach enforces server-side. But still gate the UI to prevent confusing UX.
4. **Validate addresses with `isAddress(input)`** from viem before passing to writeContract.
5. **API keys**:
   - `NEXT_PUBLIC_*` vars are visible to users — only put publishable keys there
   - Lighthouse free-tier API key CAN be public
   - WalletConnect projectId CAN be public
   - Any backend-only secret (SQLite DB path, agent private key) must NOT be in NEXT_PUBLIC
6. **SIWE replay protection**: always include a unique `nonce` per linking attempt. Server must reject reused nonces.
7. **chainId in SIWE**: use `50312`. If user signs from wallet on another chain, the SIWE verification still passes (we control the verifier) but message clarity helps users.
8. **Sanitize CIDs** before rendering as links — `https://gateway.lighthouse.storage/ipfs/{cid}` only; reject anything that doesn't match CID format.
9. **Don't expose the agent's private key path** — that lives on the off-chain agent server, not FE.

---

## 16. Performance

### 16.1 Bundle size
- Use Next.js dynamic imports for heavy components (Recharts, FileViewer)
- Lazy-load the @lighthouse-web3/sdk only on the capsule pages

### 16.2 RPC quota
- wagmi caches by default — let it work
- For real-time data (status, latestDecision), use 10-second `refetchInterval`
- For decision history, fetch once and update via event subscription

### 16.3 Event subscription throttling
- WSS connections cost RPC quota — only subscribe on dashboard pages
- Cleanup on unmount via wagmi's built-in lifecycle

---

## 17. Pages structure (suggested)

```
app/
├── layout.tsx                    Providers wrapper + global nav
├── page.tsx                      Landing page (marketing)
├── connect/page.tsx              "Connect wallet" intro
├── onboard/
│   ├── create-will/page.tsx      Step 1: register will
│   ├── deposit/page.tsx          Step 2: deposit assets
│   ├── link-telegram/page.tsx    Step 3: link Telegram
│   └── capsule/page.tsx          Step 4: optional capsule upload
├── dashboard/page.tsx            Main owner dashboard
├── history/page.tsx              Decision history + receipts
├── claim/[testator]/page.tsx     Beneficiary claim page
├── audit/[user]/page.tsx         Public audit view (no wallet needed)
└── api/
    └── telegram/
        ├── link/route.ts         Issue link token after SIWE verify
        └── status/route.ts       Check if user linked
```

---

## 18. Coordination with team

### What we (SC/Agent team) deliver to you

| When | What |
|---|---|
| End of W1 | Deployed contract addresses on Somnia Testnet + ABIs in `sc/out/` |
| W2 (Workshop 1) | Updated CONTRACT-INTERFACES.md if any signatures change |
| Throughout | Live agent on testnet — your dashboard can show real decisions |

### What you deliver to us

| When | What |
|---|---|
| End of W1 | Confirmed wallet UX + a screenshot of "Create Will" flow |
| W2 | Working dashboard with real contract reads |
| W3 | Telegram linking + capsule upload working end-to-end |
| W4 | Polish + demo recording assistance for Jeje |

### Communication
- For ABI changes or new events → ping in shared chat
- For UX questions about flow → reference `docs/flow.md` first, then ask
- For contract bugs → file a clear repro (chain, tx hash, expected vs actual)

---

## 19. Things you can ignore

- Smart contract internals (`sc/src/*.sol`) — you only need ABIs
- Off-chain agent code (`agent/src/*`) — it runs on a server, not in your browser
- Reactivity precompile behavior — that's on-chain plumbing
- LLM prompt construction — handled by the agent contract
- Mock testing patterns — we run those in Foundry

---

## 20. Useful URLs

| Topic | URL |
|---|---|
| Wagmi docs | https://wagmi.sh |
| Viem docs | https://viem.sh |
| RainbowKit docs | https://www.rainbowkit.com/docs |
| Next.js App Router | https://nextjs.org/docs/app |
| shadcn/ui | https://ui.shadcn.com |
| Lighthouse SDK | https://docs.lighthouse.storage/lighthouse-1/quick-start |
| SIWE spec | https://eips.ethereum.org/EIPS/eip-4361 |
| Somnia agents explorer | https://agents.somnia.network |
| Somnia testnet explorer | https://shannon-explorer.somnia.network |
| Somnia faucet | https://testnet.somnia.network/ |

---

## 21. Hackathon-critical reminders

1. **Demo on Somnia Testnet only** (chain 50312). Never deploy FE pointing to mainnet during programme.
2. **Receipt URLs are your secret weapon** for the "Agent-First Design" judging criterion. Make them visible everywhere a decision is shown.
3. **The check-in button** must be the most prominent UI element on the dashboard. Judges will demo this.
4. **Capsule decryption flow** must work in <30s end-to-end. Practice the demo.
5. **Don't ship a feature that requires backend infra we haven't built** — confirm with team before adding pages.
6. **Mobile viewport** matters less for hackathon judges — desktop demo is fine, but at least don't break the layout.
7. **Keep it simple** — judges look at 4 criteria (Functionality, Agent-First, Innovation, Autonomous Performance). A clean 6-screen UX beats a 20-screen labyrinth.

---

*Last updated: 2026-05-14. Update when contract ABIs change or when libraries are pinned. Source of truth for FE conventions.*
