# Project Rules — Memogent

These rules are mandatory for all contributors (humans and AI agents) working in this repository. The goal is to maintain code quality, architectural consistency, and production readiness.

---

## 0. Platform Overview

> *"Register your will once. Memogent watches over your legacy — and when the time comes, your wishes execute themselves."*

**Memogent** is an autonomous digital legacy guardian built on **Somnia Network**. A user registers a will once, deposits assets (STT / ERC-20 / NFTs), and from that point forward an off-chain AI agent monitors them via Somnia LLM consensus. When the deadline arrives — or the AI classifies risk as `EXECUTE` — inheritance fires automatically: assets transfer to the beneficiary, an AI-generated empathy message is dispatched, and an encrypted Time Capsule becomes claimable.

The full FE-specific contract + integration guide lives in `frontend/rules/bima-guide.md` — read it before designing new features. This section captures the engineering-relevant subset.

### Context

- **Hackathon**: Somnia AI Awakening — on-chain AI track. Memogent leans into Somnia's LLM consensus + Reactivity subscriptions so AI assessments and inheritance triggers are fully on-chain auditable.
- **Why Somnia**: native LLM consensus via Somnia Agents + high-throughput EVM L1 + Reactivity event subscriptions. Build choices must lean into this stack, not abstract it away.

### The Problem We Solve

Traditional wills require trusted human executors and slow legal processes. Crypto wallets have no inheritance path — assets become unreachable when the owner is gone. Single-AI dead-man-switches are brittle: one bad inference can mis-execute irreversibly. **Memogent's thesis: an autonomous agent backed by on-chain LLM consensus is the only credible bridge between "wallet you control today" and "wallet your loved ones inherit tomorrow."**

### Core Mechanic (Lifecycle)

```
User registers will + deposits assets
        ↓
Reactivity subscribes to the deadline
        ↓
Off-chain agent polls periodically  ──┐
        │                              │
        │  (signals: checkInAge,       │
        │   walletTxAge, tgLastSeen…)  │
        │                              │
        ▼                              │
Somnia LLM consensus → classification ─┘
        ↓
   SAFE  → loop continues
   WATCH / GRACE → user nudged via Telegram
   EXECUTE (or deadline reached) → inheritance fires
        ↓
Assets transferred · Empathy message generated · Capsule released
        ↓
Beneficiary claims via Telegram (/claimcapsule) or web (trustless v2)
```

Classifications are **categorical only** — `SAFE` / `WATCH` / `GRACE` / `EXECUTE`. There is no numeric risk score.

### Platform Surfaces

| Surface                       | Status         | Purpose                                                                            |
| ----------------------------- | -------------- | ---------------------------------------------------------------------------------- |
| 🌐 **Landing**                | **Active MVP** | Marketing + wallet connect entry.                                                  |
| 🪪 **Onboarding**             | **Active MVP** | Register will → deposit assets → link Telegram → optional Time Capsule upload.     |
| 📊 **Owner Dashboard**        | **Active MVP** | Status, latest AI classification, check-in CTA, vault snapshot, capsule indicator. |
| 📜 **AI Decision History**    | **Active MVP** | Timeline of `RiskDecision` events with signal context + on-chain receipt links.    |
| 💌 **Empathy Reveal**         | **Active MVP** | Beautified rendering of `EmpathyMessageGenerated` for beneficiary view.            |
| 🔓 **Beneficiary Claim (v2)** | Optional       | Trustless web claim — decrypt Time Capsule fully in-browser via connected wallet.  |
| 🔍 **Public Audit**           | Optional       | Read-only view of any user's decision history for transparency.                    |

### Core User Surfaces

1. **Landing Page** — marketing hero, value props, wallet connect.
2. **Onboarding Flow** — multi-step: create will → deposit STT/tokens/NFT → link Telegram (SIWE + deep-link to `@memogent_v1_bot`) → optional Time Capsule upload.
3. **Owner Dashboard** — the daily-driver surface. Prominent **check-in** button (the most-pressed control in the demo), status badge (`Active` / `Warning` / `Inactive`), AI classification panel, vault snapshot.
4. **AI Activity Panel** *(killer feature)* — latest classification, signal context (`checkInAgeHours`, `walletTxAgeHours`, `tgLastSeenMin`), receipt links to Shannon Explorer. Makes the AI autonomy *visible*.
5. **Empathy Message Card** — serif, italic, slow-reveal rendering of the AI-generated farewell.
6. **Beneficiary Claim** — optional trustless web path; primary heir path is Telegram `/claimcapsule`.

### Primary Assets

| Asset             | Source                | Role                  |
| ----------------- | --------------------- | --------------------- |
| **STT**           | Somnia Testnet native | Gas + vault deposits  |
| **ERC-20**        | Any (test: MTT mock)  | Vault deposits        |
| **NFT (ERC-721)** | Any (test mock)       | Vault deposits        |

Live contract addresses, network config, and ABIs are tracked in `bima-guide.md` §2.

### High-Level Architecture

Memogent has three layers: **off-chain agent orchestration**, **on-chain Somnia contracts**, and **this frontend**. AI inference happens via Somnia Agents (on-chain consensus); inheritance, vault, and capsule logic live in contracts; the FE is the human surface.

```
┌───────────────────────────────────────────────────────────────┐
│                       User (Browser)                          │
└─────────────────────────────┬─────────────────────────────────┘
                              │
┌─────────────────────────────▼─────────────────────────────────┐
│              Memogent Frontend  (this repo)                   │
│   Next.js 16 App Router · React 19 · Tailwind v4 · shadcn/ui  │
│   Wagmi v2 + Viem · RainbowKit · TanStack Query · siwe        │
│   ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌────────────┐   │
│   │  app/    │ │features/ │ │ components/  │ │  lib/      │   │
│   │ (routing)│ │ (domain) │ │ (UI kit)     │ │  (config)  │   │
│   └──────────┘ └────┬─────┘ └──────────────┘ └────────────┘   │
│                    │                                          │
│              ┌─────▼──────┐                                   │
│              │ services/  │  ← contract reads/writes + APIs   │
│              └─────┬──────┘                                   │
└────────────────────┼──────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌─────────────────┐     ┌──────────────────────────────────────┐
│  Off-Chain      │     │  On-Chain (Somnia Testnet)           │
│  Agent          │     │  MemogentCore · MemogentAgent V3     │
│                 │     │  TimeCapsule · SomniaAgents          │
│  LLM consensus  │     │                                      │
│  Telegram bot   │     │  Reactivity subscriptions            │
│  Supabase       │     │  Shannon Explorer (verified)         │
└─────────────────┘     └──────────────────────────────────────┘
```

### Tech Stack

| Layer            | Tooling                                                       |
| ---------------- | ------------------------------------------------------------- |
| Framework        | Next.js 16 (App Router) — see `AGENTS.md`, check bundled docs |
| Language         | TypeScript (strict mode)                                      |
| UI runtime       | React 19 (+ React Compiler via `babel-plugin-react-compiler`) |
| Styling          | Tailwind CSS v4 + design tokens (section 6)                   |
| Components       | shadcn/ui                                                     |
| Linter/Formatter | Biome                                                         |
| Package Manager  | pnpm                                                          |
| Deployment       | Vercel (Fluid Compute)                                        |
| Web3             | Wagmi v2 + Viem · RainbowKit                                  |
| Auth (Telegram)  | siwe (EIP-4361) + Next.js API route                           |
| Data fetching    | TanStack Query · on-chain reads via Viem · Supabase JS (anon) |
| Real-time        | Wagmi `useWatchContractEvent` on Somnia event logs            |
| Forms            | react-hook-form + zod                                         |
| Dates            | date-fns                                                      |
| Charts           | Recharts (classification history timeline)                    |
| Crypto           | Web Crypto API (AES-256-GCM, browser-native)                  |
| IPFS read        | `fetch` to Pinata gateway                                     |

### Core Features (Codebase Modules)

Modules live under `src/features/<feature>/` and expose a public API via `index.ts`. Top-level **page components** live under `src/components/pages/(landing)/` and `src/components/pages/(main)/`; the corresponding `src/app/(landing)/` and `src/app/(main)/` route entries are thin 5-line imports of those page components.

- `features/wallet/` — RainbowKit + wagmi setup, chain config
- `features/onboard/` — create will, deposit, capsule upload steps
- `features/dashboard/` — status badge, check-in CTA, vault snapshot
- `features/ai-activity/` — latest classification panel + history chart
- `features/empathy/` — empathy message reveal card
- `features/capsule/` — Time Capsule attach + claim flows
- `features/telegram/` — SIWE deep-link to bot
- `features/audit/` — public read-only decision history

### Audience & Design Principle

- **Audience**: crypto-native users planning for digital legacy + hackathon judges. They want verifiability (AI receipts on-chain), emotional credibility (empathy message), and a demo that *just works*.
- **Design language**: clean, modern, slightly somber — this is a product about mortality and inheritance, not gamification. Empathy moments lean **serif + italic + generous whitespace**. Functional surfaces lean **flat, minimal, shadcn/ui defaults** on the red + white palette in section 6.
- **Brand voice**: calm, honest, never sales-y. Acknowledge the heaviness of the topic without sentimentality.

### Naming (Locked)

- **Platform**: `Memogent` (capital `M`).
- **Surfaces**: Landing, Onboarding, Dashboard, AI Activity, Empathy Reveal, Claim, Audit.
- **Vocabulary**: *Will* (not Trust), *Beneficiary* (not Heir), *Check-in* (not Heartbeat), *Time Capsule* (the encrypted message), *Vault* (the asset escrow inside `MemogentCore`), *Classification* (not Risk Score — categorical labels only: SAFE / WATCH / GRACE / EXECUTE).
- **Bot handle**: `@memogent_v1_bot`.

### Hackathon Scope Guardrails

- **Must-have**: Landing + connect, onboarding (create will + deposit STT + link Telegram), owner dashboard with check-in + AI classification panel, empathy message render, capsule upload (CLI fallback acceptable).
- **Should-have**: Vault snapshot with ERC-20/NFT, AI decision history timeline, Telegram link badge, beneficiary claim page (trustless web), public audit page.
- **Out of scope**: ECIES key wrapping (v2 roadmap), production audit, multi-chain, mainnet deploy, mobile-first PWA.

### Non-Negotiables

1. **Clean Architecture** — separation of concerns is strictly enforced (section 3).
2. **No-comment policy** — code must be self-documenting (section 5).
3. **AI decisions must be visible** — every classification, signal-context string, and empathy message surfaces in the UI with an on-chain receipt link to Shannon Explorer. Hiding the AI defeats the entire pitch.
4. **The check-in button is sacred** — it is the single most important interactive element in the product. Always prominent on the dashboard, never below the fold.
5. **Somnia-native, not Somnia-tolerant** — use Somnia Agents for LLM consensus, Reactivity for deadlines, and Shannon Explorer for receipts. No abstraction layers that hide the chain.
6. **Honest about limits** — disclose MVP constraints (e.g. plaintext AES key in storage pending ECIES v2). No inflated demos.
7. **Production-ready** — every PR must pass the checklist in section 8.

---

## 1. Commit & Push Rules (Conventional Commits)

Every commit **must** follow the [Conventional Commits](https://www.conventionalcommits.org/) standard. Commit messages must start with one of the following prefixes:

| Prefix      | Purpose                                                                |
| ----------- | ---------------------------------------------------------------------- |
| `feat:`     | A new user-facing feature                                              |
| `fix:`      | A bug fix                                                              |
| `docs:`     | Documentation changes (README, public comments, JSDoc, etc.)           |
| `style:`    | Formatting, whitespace, semicolons — no logic change                   |
| `refactor:` | Code restructuring without behavior change                             |
| `perf:`     | Performance improvements                                               |
| `test:`     | Adding or fixing tests                                                 |
| `build:`    | Build system, dependencies, or lockfile changes                        |
| `ci:`       | CI/CD configuration changes                                            |
| `chore:`    | Maintenance tasks that don't fit other categories                      |
| `revert:`   | Reverting a previous commit                                            |

### Commit Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Rules

- **Subject** is written in English, lowercase, imperative mood, no trailing period, max 72 characters.
- **Scope** is optional; use it to mark the affected module/feature (e.g. `feat(auth): add login form`).
- **Body** is optional; explain the **why**, not the **what**.
- **Breaking changes** must be marked with `BREAKING CHANGE:` in the footer or `!` after the type (e.g. `feat!: drop support for Node 18`).
- **Forbidden**: generic messages such as `update`, `fix bug`, `wip`, `asdf`.

### Push Rules

- **Forbidden** to force-push to `main` / `master` / `develop`.
- **Forbidden** to use `--no-verify` to skip hooks without maintainer approval.
- Use branch naming: `feat/<feature-name>`, `fix/<bug-name>`, `chore/<task>`.
- PRs must pass lint, type-check, and tests before merge.
- Squash-merge is the default for feature branches to keep `main` history clean.

### Secret Files — NEVER Push

- **Strictly forbidden** to commit or push files containing secrets, including but not limited to:
  - `.env`, `.env.local`, `.env.development`, `.env.production`, `.env.*.local`
  - Private keys (`*.pem`, `*.key`, `id_rsa`, mnemonics, seed phrases)
  - Credentials files (`credentials.json`, `service-account.json`, `gcp-key.json`)
  - API tokens, OAuth secrets, GitHub tokens, database connection strings, signing keys
  - Wallet keystores, smart contract deployer keys, RPC URLs containing API keys
- All of the above **must** be listed in `.gitignore` before any work begins.
- Use `.env.example` (committed) to document the required variables — never commit real values.
- Stage files explicitly by name (`git add path/to/file`); **avoid** `git add .` or `git add -A`, which can sweep in untracked secret files by accident.
- Before pushing, run `git diff --cached` and verify no `.env*`, key, or credential file is included.
- If a secret is accidentally committed: **rotate the secret immediately** (it must be considered compromised), purge it from history (`git filter-repo` / BFG), and force-push only after maintainer approval.
- Tools (humans and AI agents) loading a secret from `.env*` to perform a task **must** consume it inline (e.g. shell variable, redacted output) and never echo, log, or write it to any tracked file.

---

## 2. Clean Code Rules

All code **must** be clean, maintainable, and readable.

### Naming

- Use **descriptive** and **self-explanatory** names — avoid ambiguous abbreviations (`usr`, `tmp`, `data2`).
- `camelCase` for variables and functions, `PascalCase` for components and types, `SCREAMING_SNAKE_CASE` for global constants.
- Booleans start with `is`, `has`, `should`, `can` (e.g. `isLoading`, `hasError`).
- Component files: `PascalCase.tsx`. Util/hook files: `camelCase.ts` or `kebab-case.ts` per module convention.

### Functions

- One function = one responsibility (Single Responsibility).
- Max 30 lines per function. Beyond that, it **must** be split.
- Max 3 parameters. Beyond that, use an object parameter.
- Avoid nested ternaries and deep nesting (>3 levels) — prefer early returns / guard clauses.

### Readability

- **No comments in code** (see section 5).
- Code must be self-documenting through clear naming.
- Avoid magic numbers / magic strings — extract them into named constants.
- Stay consistent with the existing codebase style. Respect the Biome / ESLint / Prettier config.

### Maintainability

- DRY (Don't Repeat Yourself), but don't over-abstract. Three occurrences is the refactor threshold.
- KISS (Keep It Simple, Stupid). The simplest solution that solves the problem always wins.
- YAGNI (You Aren't Gonna Need It). Don't write code for hypothetical needs.
- Write tests for non-trivial logic (unit tests for utils, integration tests for important flows).

---

## 3. Architecture Rules (Clean Architecture)

The project architecture must be **clean**, **modular**, and follow Clean Architecture principles.

### Layering

```
src/
├── app/                  # Next.js App Router (pages, layouts, route handlers)
├── features/             # Feature modules (domain-driven)
│   └── <feature>/
│       ├── components/   # UI components owned by this feature
│       ├── hooks/        # React hooks
│       ├── services/     # API calls / data access
│       ├── stores/       # State management
│       ├── types/        # Types & interfaces
│       └── utils/        # Pure helpers
├── components/           # Shared UI components (design system)
│   └── ui/               # Primitives (Button, Input, Card, ...)
├── lib/                  # Shared library (api client, fetcher, etc.)
├── hooks/                # Shared hooks
├── utils/                # Shared pure utils
├── types/                # Shared types & interfaces
├── config/               # Configuration (env, theme, routes)
└── styles/               # Global styles
```

### Dependency Rule

- **Domain / business logic** must not depend on **UI** or **framework**.
- **UI layer** may depend on **business logic**, never the other way around.
- **Outer layers** (UI, infrastructure) depend on **inner layers** (domain), never the reverse.
- **Circular dependencies** between modules are forbidden.

### Separation of Concerns

- Components **only** handle presentation. Complex logic is lifted into custom hooks or services.
- Services **only** handle communication with APIs / external systems.
- Stores **only** handle state management.
- Utils **only** contain pure functions with no side effects.

### Modularity

- New features are built as modules in `src/features/<feature>/`.
- Direct imports of internal files from another feature are forbidden — go through that feature's `index.ts` (public API).
- Shared code used by more than 2 features is moved to `src/components`, `src/hooks`, or `src/utils`.

---

## 4. Clean Files Rules

- **Forbidden** to keep unused files (dead code, backup files, `*.old.tsx`).
- **Forbidden** to commit `console.log`, `debugger`, or commented-out code.
- **Forbidden** to commit credentials, API keys, or any secrets.
- `.env`, `.env.local`, etc. **must** be in `.gitignore`.
- Each file has **one** responsibility. If a file exceeds 300 lines, evaluate whether to split it.
- Import order: external libraries → internal aliases (`@/...`) → relative paths → styles.
- Remove unused imports (auto-fixed via Biome / ESLint).

---

## 5. No Comment Rule

**No comments are allowed in source code.** Code must be self-explanatory through clear naming and structure.

### Exceptions (allowed)

- JSDoc / TSDoc on **public APIs** (exported functions/components consumed by other modules).
- Comments explaining the **WHY** behind a non-obvious workaround (browser bug, hardware constraint, etc.). Include an issue/PR link when available.
- TODO/FIXME entries that **must** include an owner and a tracker link (`// TODO(@efran): [LINEAR-123] handle retry`).
- License headers required by legal obligation.

### Forbidden

- Comments explaining the **WHAT** — the code already does that.
- Comments referring to a task/PR/sprint (`// added for sprint 12`).
- Commented-out code — use version control for history.
- Decorative comments (`// ===== UTILS =====`).

---

## 6. Design Pattern: Red + White

The project's visual identity uses **red & white** as its primary palette.

### Color Tokens

Use semantic tokens, not hex literals inside components.

```ts
const colors = {
  primary: {
    50:  "#FFF1F2",
    100: "#FFE4E6",
    300: "#FDA4AF",
    500: "#E11D48",
    600: "#BE123C",
    700: "#9F1239",
    900: "#4C0519",
  },
  neutral: {
    0:    "#FFFFFF",
    50:   "#FAFAFA",
    100:  "#F5F5F5",
    200:  "#E5E5E5",
    500:  "#737373",
    900:  "#171717",
  },
};
```

### Usage Rules

- **Primary action** (CTA, active link, indicator): red (`primary.500` / `primary.600`).
- **Main background**: white (`neutral.0` / `neutral.50`).
- **Main text**: `neutral.900` on a white background.
- **Surface / card**: white with a thin `neutral.200` border.
- **Hover state for primary**: use `primary.600` or `primary.700`.
- **Disabled state**: `neutral.200` background, `neutral.500` text.
- **Secondary accents** (success, warning, error) are still allowed for semantic feedback — but red remains dominant for brand identity.
- **Contrast** must meet WCAG AA (ratio ≥4.5:1 for body text).

### Implementation

- Use the Tailwind theme / CSS variables — **no hardcoded hex values** in JSX.
- Tokens are defined once in `tailwind.config` / `src/styles/tokens.css` and consumed via classes or variables.

---

## 7. UI/UX Rules: Minimalist & Clean

The design **must** be minimalist, clean, and production ready.

### Principles

- **Less is more.** Remove any element without a clear purpose.
- **Clear hierarchy** — users know where to look first.
- **Generous whitespace** — never crowd elements without reason.
- **Consistency** — the same component behaves and looks the same throughout the app.
- **Typography**: max 2 font families, max 5 font sizes per screen.
- **Iconography**: use a single icon set (Lucide / Heroicons) with consistent sizes.

### Layout

- Use a consistent 12-column grid / flexbox.
- Spacing follows a 4px scale (4, 8, 12, 16, 24, 32, 48, 64).
- Border radius is consistent — define `sm`, `md`, `lg`, `full` tokens.
- Soft shadows, never excessive. Max 3 elevation levels.

### Interaction

- **Feedback**: every user action must have feedback (loading, success, error).
- **Loading state**: skeleton > spinner. Avoid blocking the UI.
- **Empty state**: explain the situation and provide a CTA when relevant.
- **Error state**: clear, actionable, human messages (never raw stack traces).
- **Animation**: subtle, 150–250ms duration, `ease-out` easing. Respect `prefers-reduced-motion`.

### Accessibility (a11y)

- Semantic HTML (`<button>` for actions, `<a>` for navigation).
- Every input has a `<label>`.
- Focus states **must** be visible.
- Keyboard navigable — every action reachable via Tab.
- Meaningful alt text for images; `alt=""` for decorative ones.
- ARIA only when semantic HTML isn't enough.

### Responsive

- **Mobile-first.** Design for the smallest screen first, then scale up.
- Breakpoints follow Tailwind defaults: `sm`, `md`, `lg`, `xl`, `2xl`.
- Touch targets are at least 44×44 px.

---

## 8. Production Ready Checklist

Before merging into `main`, all the following items **must** be satisfied:

- [ ] `pnpm lint` — passes with no errors/warnings.
- [ ] `pnpm type-check` (or `tsc --noEmit`) — passes with no errors.
- [ ] `pnpm test` — all tests green.
- [ ] `pnpm build` — build succeeds with no warnings.
- [ ] No `console.log`, `debugger`, or unowned `TODO`s.
- [ ] No secrets / credentials committed.
- [ ] Environment variables documented in `.env.example`.
- [ ] Loading, empty, and error states handled.
- [ ] Tested on mobile, tablet, and desktop.
- [ ] Performance check (Lighthouse / Web Vitals) — LCP <2.5s, CLS <0.1, INP <200ms.
- [ ] Accessibility check — keyboard navigable, contrast OK, screen reader OK.
- [ ] Clear PR description: **what** & **why**, linked issue, screenshot/video for UI changes.

---

## 9. Enforcement

- These rules are enforced through: **Biome / ESLint**, **TypeScript strict mode**, **commitlint**, **husky pre-commit**, and **CI pipeline**.
- Repeated violations → PR will be blocked.
- Rule updates must go through a PR to this file, with discussion in review.

> Rules exist to help, not to obstruct. If any rule blocks productivity without delivering value, propose a revision via PR.

