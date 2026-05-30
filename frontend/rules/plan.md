# Frontend Execution Plan — Memogent

> Authoritative plan for the FE under `frontend/`. Aligned with `rules.md` §0 (Platform Overview) and `bima-guide.md` (contracts, ABIs, integration patterns). Read both before executing any milestone.

---

## 1. Goal

Ship the must-have surfaces in `rules.md` §0 hackathon scope on Next.js 16 + React 19, integrated with Somnia Testnet contracts and the off-chain agent:

1. Landing (marketing + connect)
2. Onboarding (create will → deposit → link Telegram → optional capsule)
3. Owner Dashboard (status, check-in, AI classification panel, vault snapshot)
4. AI Decision History (timeline)
5. Empathy Reveal
6. Optional: Beneficiary Claim (trustless), Public Audit

---

## 2. File Layout (Authoritative)

The route entries under `src/app/(landing)` and `src/app/(main)` are **thin 5-line files** that import a page component from `src/components/pages/(landing)` or `src/components/pages/(main)`. Page components own the real markup; route entries own only the routing contract.

```
src/
├── app/
│   ├── (landing)/
│   │   └── page.tsx              ← 5-line import: { LandingPage }
│   ├── (main)/
│   │   ├── dashboard/page.tsx    ← 5-line import: { DashboardPage }
│   │   ├── onboard/
│   │   │   ├── create/page.tsx   ← 5-line import: { OnboardCreatePage }
│   │   │   ├── deposit/page.tsx
│   │   │   ├── telegram/page.tsx
│   │   │   └── capsule/page.tsx
│   │   ├── history/page.tsx
│   │   ├── claim/[owner]/page.tsx
│   │   └── audit/[user]/page.tsx
│   ├── api/
│   │   ├── telegram/link/route.ts
│   │   └── capsule/upload/route.ts
│   ├── providers.tsx             ← Wagmi + QueryClient + RainbowKit
│   ├── layout.tsx                ← mounts <Providers>
│   └── globals.css
│
├── components/
│   ├── pages/
│   │   ├── (landing)/
│   │   │   ├── LandingPage.tsx
│   │   │   ├── Hero.tsx
│   │   │   ├── Pillars.tsx
│   │   │   ├── HowItWorks.tsx
│   │   │   ├── FaqSection.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── index.ts          ← re-exports LandingPage
│   │   └── (main)/
│   │       ├── DashboardPage.tsx
│   │       ├── OnboardCreatePage.tsx
│   │       ├── OnboardDepositPage.tsx
│   │       ├── OnboardTelegramPage.tsx
│   │       ├── OnboardCapsulePage.tsx
│   │       ├── HistoryPage.tsx
│   │       ├── ClaimPage.tsx
│   │       ├── AuditPage.tsx
│   │       └── index.ts          ← re-exports every page component
│   └── ui/                       ← shadcn primitives (Button, Card, Input, …)
│
├── features/
│   ├── wallet/                   ← connect, chain switch
│   ├── onboard/                  ← form schemas, deposit hooks
│   ├── dashboard/                ← status, check-in, vault hooks
│   ├── ai-activity/              ← classification panel, history chart
│   ├── empathy/                  ← reveal card
│   ├── capsule/                  ← attach + claim
│   ├── telegram/                 ← SIWE + deep-link
│   └── audit/                    ← public read-only view
│
├── lib/
│   ├── chains.ts                 ← somniaTestnet defineChain
│   ├── wagmi.ts                  ← getDefaultConfig
│   ├── contracts.ts              ← CONTRACTS addresses (bima-guide §2)
│   ├── supabase.ts               ← anon client
│   └── format.ts                 ← address, date, amount helpers
│
└── abi/
    ├── MemogentCore.ts           ← exported `as const` ABI
    ├── MemogentAgent.ts
    ├── TimeCapsule.ts
    └── erc20.ts / erc721.ts
```

### Index pattern (5-line route entries)

```tsx
// src/app/(landing)/page.tsx
import { LandingPage } from "@/components/pages/(landing)";

export default function Page() {
  return <LandingPage />;
}
```

```tsx
// src/app/(main)/dashboard/page.tsx
import { DashboardPage } from "@/components/pages/(main)";

export default function Page() {
  return <DashboardPage />;
}
```

```ts
// src/components/pages/(landing)/index.ts
export { LandingPage } from "./LandingPage";
```

```ts
// src/components/pages/(main)/index.ts
export { DashboardPage } from "./DashboardPage";
export { OnboardCreatePage } from "./OnboardCreatePage";
export { OnboardDepositPage } from "./OnboardDepositPage";
export { OnboardTelegramPage } from "./OnboardTelegramPage";
export { OnboardCapsulePage } from "./OnboardCapsulePage";
export { HistoryPage } from "./HistoryPage";
export { ClaimPage } from "./ClaimPage";
export { AuditPage } from "./AuditPage";
```

Cross-feature imports always go through these `index.ts` public APIs — `rules.md` §3 forbids deep imports.

---

## 3. Milestones

### M1 — Scaffolding & Providers

- Install deps:
  ```bash
  pnpm add wagmi viem @tanstack/react-query @rainbow-me/rainbowkit
  pnpm add @supabase/supabase-js siwe
  pnpm add react-hook-form zod @hookform/resolvers
  pnpm add date-fns recharts
  pnpm dlx shadcn@latest init
  ```
- `src/lib/chains.ts` — `somniaTestnet` via `defineChain` (chainId 50312)
- `src/lib/wagmi.ts` — `getDefaultConfig` with RainbowKit
- `src/lib/contracts.ts` — addresses from `bima-guide.md` §2
- `src/lib/supabase.ts` — `anon` key only (browser-safe)
- `src/abi/*.ts` — copy `abi` field from `sc/out/<Contract>.sol/<Contract>.json`, export `as const`
- `src/app/providers.tsx` — `<WagmiProvider> > <QueryClientProvider> > <RainbowKitProvider>`
- Wire `RootLayout` to mount `<Providers>`
- `.env.example` — `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Done when:** `pnpm dev` boots, RainbowKit connect button shows on a placeholder landing, wallet switches to Somnia Testnet.

### M2 — Landing

- `LandingPage.tsx` composes: `Hero` → `Pillars` (Autonomous · Encrypted · Verifiable) → `HowItWorks` → `FaqSection` → `Footer`
- RainbowKit connect button in Hero; after connect, router push to `/dashboard`
- Copy is calm + honest (see `rules.md` §0 Audience & Design Principle)

**Done when:** Lighthouse LCP < 2.5s on landing.

### M3 — Onboarding (multi-step)

- `OnboardCreatePage` — react-hook-form + zod (`beneficiary: address`, `inactivePeriodDays: 1–365`), calls `MemogentCore.registerWill`
- `OnboardDepositPage` — tabs for STT / ERC-20 / NFT
  - STT: `depositSTT` with `value: parseEther(...)`
  - ERC-20: two-step `approve` → `depositToken`, UI shows "Step 1/2 Approving…" → "Step 2/2 Depositing…"
  - NFT: `approve` or `setApprovalForAll` → `depositNFT`
- `OnboardTelegramPage` — SIWE sign flow → POST `/api/telegram/link` → window.open `https://t.me/memogent_v1_bot?start=<token>`
- `OnboardCapsulePage` — file picker → POST `/api/capsule/upload` (server holds Pinata JWT) → returns `{ cid, contentHash, encryptionKey }` → `TimeCapsule.attachCapsule(...)`. **MVP disclosure banner** about plaintext key storage (see `bima-guide.md` §10.2)
- API routes:
  - `app/api/telegram/link/route.ts` — verify SIWE, mint `link_<hex>` token, insert into `link_token` with 10-min TTL (service-role only, never exposed)
  - `app/api/capsule/upload/route.ts` — read file → AES-256-GCM encrypt → Pinata upload → return metadata

**Done when:** full onboarding works on Somnia Testnet, observed on Shannon Explorer.

### M4 — Owner Dashboard (highest priority)

- `DashboardPage` uses `useReadContracts` (batched, `refetchInterval: 10_000`):
  - `MemogentCore.getWillInfo(user)`
  - `MemogentCore.getStatus(user)`
  - `MemogentCore.vaultSTT(user)`
  - `MemogentAgent.latestAssessment(user)`
  - `TimeCapsule.hasCapsule(user)`
- **Check-in CTA** (large, primary, top of fold) → `MemogentCore.checkIn()`
- Status badge derived from `getStatus`:
  - `Active` → green, countdown to deadline
  - `Warning` → yellow, urgent check-in prompt
  - `Inactive` → red, read-only beneficiary view
- **AI Activity Panel** (key surface for judging criterion #2):
  - Classification chip + `assessedAt` relative time
  - Signal context string (`checkInAgeHours=…; walletTxAgeHours=…; tgLastSeenMin=…`)
  - "View on-chain receipt" → Shannon Explorer link
- Vault snapshot: STT amount + ERC-20 list via `getVaultHistory` + NFT grid
- Capsule indicator: ✅ Attached / ⚠️ Not yet
- Live events via `useWatchContractEvent`:
  - `RiskDecision` → toast + invalidate dashboard query
  - `EmpathyMessageGenerated` → open modal
  - `CheckedIn` → toast + refetch

**Done when:** check-in button, status badge, AI panel, and live event reactivity all work end-to-end.

### M5 — AI Decision History

- `HistoryPage` queries `MemogentAgent.AssessmentReceived` logs filtered by `user`
- Recharts timeline (one dot per assessment, color-coded by classification)
- Click dot → side drawer with full event details + Shannon Explorer tx link
- Pagination: last 90 days client-side

**Done when:** 7+ real assessments render after agent loop has run.

### M6 — Empathy Reveal + Claim (optional v2)

- Empathy card (used inside dashboard for owner preview + inside claim page for beneficiary):
  - Serif font (`font-serif` Tailwind class via `next/font/google`)
  - Italic, large leading, generous whitespace
  - Slow typewriter reveal (~30ms/char), respect `prefers-reduced-motion`
- `ClaimPage` (`/claim/[owner]`):
  - Read `TimeCapsule.getCapsule(owner)` + `isReleased(owner)`
  - If released, button → fetch `getDecryptionKey` with `account: beneficiary` override (view call, msg.sender spoofable per `bima-guide.md` §10.2)
  - Fetch ciphertext from Pinata gateway, Web Crypto AES-GCM decrypt, verify `keccak256(plaintext) == contentHash`
  - Render plaintext text / image / video based on MIME sniff
  - Disclose plaintext-key MVP limitation in a callout

**Done when:** owner uploads → will executed → beneficiary decrypts in browser ≤ 10s.

### M7 — Polish & Demo Prep

- Loading skeletons on every fetch (no spinners blocking layout — see `rules.md` §7)
- Empty states with CTAs ("No will yet → Create one")
- Error toasts mapped from `bima-guide.md` §12 revert table
- Mobile QA at `sm` breakpoint (demo is desktop, but no broken layouts)
- Lighthouse pass: LCP <2.5s, CLS <0.1, INP <200ms
- a11y pass: keyboard nav, focus rings, WCAG AA contrast, `aria-live="polite"` for live event toasts
- Demo dry-run with Jeje using a fresh wallet on Somnia Testnet faucet

**Done when:** `rules.md` §8 Production Ready Checklist passes for the PR that merges to main.

---

## 4. Conventions Reminder (See `rules.md` for Full Detail)

- **Commits**: Conventional Commits with scopes — `feat(dashboard):`, `fix(onboard):`, `chore(deps):` (§1)
- **No comments** in source except JSDoc on exported public APIs (§5)
- **No hex literals in JSX** — use Tailwind theme tokens from §6 (red + white palette)
- **Cross-feature imports** go through `index.ts` only (§3)
- **Boolean naming**: `is`, `has`, `should`, `can` (§2)
- **30-line function limit**, **3-param limit** (§2)
- **Secrets**: `.env*` in `.gitignore`, document in `.env.example`, never echo in code (§1)
- **Stage by name** (`git add path/to/file`) — never `git add .` (§1)

---

## 5. Out of Scope (Explicit)

- Pixel-art / village aesthetic — Memogent uses clean modern shadcn/ui, no pixel layer
- ECIES key wrapping for Time Capsule (v2 roadmap, disclosed in UI)
- Mainnet deploy
- Mobile-first PWA install flow
- Beneficiary onboarding/discovery flow — already handled by the agent's Telegram bot (`pnpm invite-beneficiary` + `/claimcapsule`)

---

## 6. Risks & Mitigations

| Risk                                              | Mitigation                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Pinata JWT leaks if used client-side              | All uploads via `/api/capsule/upload` (server-only env var)                                        |
| `getDecryptionKey` accessible to anyone via eth_call | Documented MVP limitation; v2 ECIES roadmap; disclose in claim page banner                         |
| Unsolicited Telegram DM constraint                | Already solved: agent ships `pnpm invite-beneficiary` + `/claimcapsule` (W4)                       |
| Supabase RLS not yet enforced on `anon`           | Treat anon reads as best-effort; never trust client filters for sensitive data; coordinate w/ SC   |
| Reactivity event delay or websocket drop          | Poll on-chain reads at 10s interval as fallback to `useWatchContractEvent`                         |
| User on wrong chain                               | RainbowKit auto-prompts switch to `somniaTestnet` (chainId 50312)                                  |
| ABI drift                                         | Sync from `sc/out/<Contract>.sol/<Contract>.json` each milestone; coordinate via shared chat       |

---

## 7. Definition of Done (per PR)

Per `rules.md` §8 Production Ready Checklist:

- [ ] `pnpm lint` clean
- [ ] `pnpm build` succeeds with no warnings
- [ ] No `console.log`, `debugger`, unowned `TODO`
- [ ] No secrets committed; `.env.example` documents required vars
- [ ] Loading, empty, and error states handled
- [ ] Mobile + desktop QA pass
- [ ] Lighthouse — LCP <2.5s, CLS <0.1, INP <200ms
- [ ] a11y — keyboard navigable, contrast OK, screen reader OK
- [ ] PR description: what + why + linked issue + screenshot/video for UI

---

*Last updated 2026-05-27. Source of truth for FE execution sequencing. Update when scope or contract surface changes.*
