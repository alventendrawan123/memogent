![alt text](image.png)# TODO untuk Bima

> Dari tim SC/Agent · 2026-05-29

> **Update Bima · 2026-05-30:** item di bawah udah dikerjain Claude. Status di tiap baris.

- [x] **Fix husky pre-commit.** Hook sekarang `cd frontend && pnpm exec biome check --staged --no-errors-on-unmatched` — cuma scan file yg staged, bukan seluruh frontend. Plus biome check seluruh project udah **0 error** (67 files), jadi blocker 61-error udah hilang.

- [x] **Fix MainGate.tsx.** Redirect `router.replace("/")` dibuang total, tinggal prompt "Connect your wallet to continue." in-place. (Belum di-commit — nunggu user bilang commit push.)

- [x] **`PINATA_JWT` udah ada di `.env.local`** (server-side, non-`NEXT_PUBLIC`). Capsule upload aman.

- [x] **Test `/claim/[owner]` page** pakai will executed (owner `0x7de5...FB4de`, beneficiary `0x4674...3E69`). Test PASS: connect 0x4674, buka `/claim/0x7de5...` → badge "Released" → "Decrypt & open" → fetch key (view call as 0x4674) → IPFS fetch → AES-256-GCM decrypt → keccak256 hash verified → plaintext match. Path trustless terbukti end-to-end.

- [x] **BUG Telegram-link #1 — SIWE nonce.** Udah beres sejak migrasi ke viem: `OnboardTelegramPage.tsx` pakai `createSiweMessage` (viem/siwe) + `nonce = crypto.randomUUID().replace(/-/g, "")` (alfanumerik, no dash). Round-trip lolos. (Pakai viem, bukan lib `siwe`, jadi `generateNonce` gak dipakai.)

- [x] **BUG Telegram-link #2 — token gak disimpan.** Kode FIXED: `app/api/telegram/link/route.ts` sekarang insert `{ token, wallet_address: parsed.address, nonce: parsed.nonce, expires_at: Date.now()+10min, inviter_wallet: null }` ke tabel `link_token` via `src/lib/supabase-admin.ts` (service_role client). `.env.local` user udah keisi `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` per 2026-05-30.

- [x] **BUG dashboard — "in 56390 years".** Fixed. Diverifikasi dari kontrak: `MemogentCore.sol` simpan `deadlineTimestamp = (block.timestamp + sec) * 1000` (**ms**), sedang `lastCheckIn` = detik. `DashboardPage.tsx` sekarang `relativeTime(Number(deadlineMs) / 1000)` + var di-rename `deadlineSec`→`deadlineMs`. `ClaimPage`/`lastCheckIn` gak disentuh (udah detik).

- [x] **BUG History + Audit — "block range exceeds 1000".** Udah beres: dua-duanya pakai chunk viem `getLogs` per 1000 block, lookback 50k block dari `latest` (bukan "earliest"), Promise.all paralel. `HistoryPage.tsx` + `AuditPage.tsx`.

- [x] **mime detection ClaimPage.** Fixed: `sniffMime` sekarang coba `new TextDecoder("utf-8", { fatal: true }).decode(bytes)` setelah cek magic-byte — kalau gak throw → `text/plain` (render inline), throw → `application/octet-stream`. Em-dash/emoji/UTF-8 sekarang ke-render inline.

- [x] **Preset "5 minutes (test)".** Ditambahin di `OnboardCreatePage.tsx` di balik flag `NEXT_PUBLIC_ENABLE_TEST_WINDOW=true`. Kalau flag on, muncul checkbox "Testing only: use a 5-minute silence window" yg kirim `300n` detik ke `registerWill` (bypass `daysToSeconds`). Default hidden biar user beneran gak kepake. **ACTION:** set `NEXT_PUBLIC_ENABLE_TEST_WINDOW=true` di `.env.local` buat demo full cycle.

---

## Update 2026-05-30 — Mock ERC20 deploys + `Erc20DepositForm` impl

- [x] **Deploy 3 mock ERC20 (BTC / USDC / USDT) di Somnia testnet.** Pakai `MockERC20.sol` parametric (constructor `name/symbol/decimals`). Mint **permissionless** — siapapun bisa `mint(addr, amount)` jadi gak butuh deployer key buat top-up.

  | Token | Decimals | Address |
  |-------|----------|---------|
  | BTC | 8 | `0x58d1DABa1eC6Aa6BF9417f18B78D199f827Aeea7` |
  | USDC | 6 | `0xD6693BA206ad5E38Ac295c4b91d62F6a4cc055Ea` |
  | USDT | 6 | `0xD10Ca33B8008fb6c40a1489d0F7d86473A1DC3d7` |

  Sumber: `sc/src/test/MockERC20.sol` + `sc/script/DeployMockTokens.s.sol`. Test wallet `0x812477...215b` udah di-pre-mint 100 BTC + 1M USDC + 1M USDT.

- [x] **`MOCK_TOKENS` di `frontend/src/lib/contracts.ts`** — object `{ btc, usdc, usdt }` masing-masing `{ address, decimals }`. Additive, gak ngubah `TEST_TOKENS` lama.

- [x] **`Erc20DepositForm` impl di `OnboardDepositPage.tsx`** (sebelumnya stub "Coming soon"). Mirror pola `SttDepositForm` (balance + max button) + `NftDepositForm` (2-step approve→deposit):
  - `useReadContract(erc20Abi.balanceOf)` buat baca saldo per token
  - `parseUnits(amount, token.decimals)` (bukan `parseEther`) — handle decimals per token
  - Step state `approve → deposit → done` dengan auto-transition lewat `useWaitForTransactionReceipt`
  - Switch token reset step ke "approve" (fresh approval per token)
  - Validasi "Insufficient balance" pakai `formatUnits` per decimals

  **Reviewable patches:** `ERC20_TOKENS` array sekarang nyimpen `address` + `decimals` dari `MOCK_TOKENS`, parent `Tabs.Content value="erc20"` di-pass `onDone={() => router.push("/onboard/telegram")}` biar konsisten sama STT/NFT.

  **Catatan lint:** dua warning biome kosmetik (`bg-black/[0.05]` → `bg-black/5`, `break-words` → `wrap-break-word`) sengaja **gak gw apply** — pola yang sama dipakai di SttDepositForm/NftDepositForm lama, biar konsisten sama style codebase lo. Kalau lo prefer canonical, refactor project-wide sekalian.

  Boleh lo refine/rewrite kalau ada bug atau style mismatch — gw bikin biar test deposit BTC/USDC/USDT bisa jalan end-to-end di FE.

---

## TODO baru 2026-05-30 — UX polish

- [x] **CTA "Register a new will" di dashboard saat will udah executed (LOW priority, polish demo).** SHIPPED — `DashboardPage.tsx` banner "Inheritance has fired" sekarang ada link "Start a new will (testing) →" ke `/onboard/create`. Commit `10f2ea4`. Sekarang setelah will executed, dashboard cuma tampil banner "Inheritance has fired" + vault 0 STT, **gak ada link/tombol buat balik onboard ulang**. User mesti ketik manual `localhost:3000/onboard/create` di address bar. Untuk **real use case** desain ini bener (orang meninggal gak register lagi) — tapi buat **testing cycle ulang + demo recovery** ribet. **Saran:**
  - Di banner "Inheritance has fired" → tambah tombol secondary kecil **"Start fresh"** atau **"Register new will (for testing)"** → push ke `/onboard/create`
  - Atau di Vault snapshot card kalau STT balance 0 + executed → link kecil "Begin a new will"

  Low priority — bukan blocker, cuma smooth-in demo + testing flow.

- [x] **Beneficiary invite UI di FE (HIGH priority untuk demo polish).** SHIPPED — page `/invite` + `InviteBeneficiaryPage` component + API route `POST /api/telegram/invite` (SIWE auth, insert link_token via supabase-admin 24h TTL). Dashboard Vault snapshot card juga ada tombol "Invite beneficiary" kalau will active. Commit `10f2ea4`. Sekarang owner mesti buka terminal & run CLI `pnpm invite-beneficiary <owner> <beneficiary>` buat generate link buat beneficiary. Buat demo + real use case, owner gak boleh disuruh sentuh terminal. **Yang perlu dibikin:**
  - **Page/section UI** di `/onboard/telegram` (tambah section "Invite your beneficiary" terpisah dari owner self-link) atau di `/dashboard` (tombol "Invite my beneficiary" di Vault snapshot card kalau will active)
  - Input beneficiary address (default auto-fill dari `getWillInfo(owner).beneficiary` kalau ada), button "Generate invite link"
  - Setelah generate: tampil URL + copy button + ideally "Share via WhatsApp" deeplink (`https://wa.me/?text=...`)
  - **Backend route** `app/api/telegram/invite/route.ts` (POST):
    - Body: `{ ownerAddress, beneficiaryAddress, signature, message }` (SIWE auth dari owner — mirip `/api/telegram/link` yang udah jalan)
    - Verify owner == will's actual owner via `core.getWillInfo`
    - Insert ke `link_token` via `supabase-admin.ts`: `{ token: 'link_' + randomHex(16), wallet_address: beneficiaryAddress, nonce, expires_at: Date.now()+24h*3600*1000, inviter_wallet: ownerAddress }`
    - Return `{ url: 'https://t.me/memogent_v1_bot?start=' + token }`
  - **Reference impl** sudah ada di `agent/src/cli/invite-beneficiary.ts` — tinggal port logic-nya ke API route.

  Tanpa ini, demo cycle yang melibatkan beneficiary Telegram (`/claimcapsule` etc) terhambat karena owner mesti terminal-savvy.

- [x] **Beneficiary discovery / Claim entry point di FE (HIGH priority demo).** SHIPPED — MainNavbar tambah link `Claim` antara Dashboard/History. Page `/claim` (index, tanpa owner) tampil: (a) form input owner address, (b) auto-detect via Supabase `tracked_will` query filter `beneficiary == connectedAddress` → kalau ketemu tampil "Wills that name you" card dengan badge Released/Sealed + tombol direct ke `/claim/<owner>`. Commit `10f2ea4`. Sekarang `Claim` link sama sekali GAK ADA di navbar. Beneficiary yang connect wallet:
  - Dashboard auto-redirect ke `/onboard/create` (karena wallet beneficiary belum punya will sebagai owner) → user kebawa ke onboarding flow yg SALAH (mereka dateng buat claim, bukan register will baru)
  - Gak ada way buat tau owner address atau navigate ke `/claim/<owner>` tanpa hafal URL
  - Saat ini owner mesti DM beneficiary URL `localhost:3000/claim/<owner-addr>` lewat WA — terlalu manual

  **Fix yang dibutuhkan:**
  - **Add `Claim` link** di MainNavbar (jejer Dashboard/History/Audit) — kalau diklik tanpa owner address, tampil page "Enter owner address" + bisa paste address dari WillExecuted DM
  - **Auto-detect beneficiary on connect**: pas wallet connect, query event `WillRegistered` (atau bisa juga read `tracked_will` Supabase) yang `beneficiary == connectedAddress` → kalau ada match, dashboard tampil card "You are the named beneficiary for will of `<owner-addr>`" + tombol "Open claim page". Pakai chunk `getLogs` 1000-block yg udah lo bikin di History/Audit, atau lebih cepet query Supabase `tracked_will` filter `beneficiary`.
  - **Bonus**: kalau dispatcher Telegram udah kirim WillExecuted DM dengan `/claimcapsule` ref + tx URL (Bima udah implement), juga tampilkan owner address dengan link `/claim/<owner>` di DM-nya biar beneficiary tinggal klik (jangan cuma `/claimcapsule` reference — kasih link FE juga sebagai alternatif).

- [x] **BUG bot `/claimcapsule` — silent fail untuk capsule binary / besar (HIGH priority).** SHIPPED — handler sekarang `sniffMime()` (magic bytes + UTF-8 fatal decode) → kalau non-text atau > 3500 chars, pakai `ctx.replyWithDocument(new InputFile(plaintext, 'memogent-capsule-<addr>.<ext>'))`. Reply call udah dibungkus try/catch yang fallback ke graceful error message kalau tetep gagal. Commit `ffbc13c`. Handler `agent/src/telegram/handlers/claimcapsule.ts:215-222` post plaintext sebagai inline code block: `` `\`\`\`\n${plaintext.toString('utf-8')}\n\`\`\`` ``. Buat capsule **teks pendek** (sesi R2 95 byte "bima round 2...") jalan ✅. Buat capsule **binary atau >3500 char** (test today: PNG screenshot 274 KB) → reply jadi ~274KB string → Telegram API reject 400 `MESSAGE_TOO_LONG` → handler **silent fail** (gak ada try/catch sendMessage). User stuck di "🔍 Verifying eligibility on-chain..." selamanya, gak ada error feedback. **Fix:** setelah decrypt, deteksi binary (mime sniff Bima yang udah ada di FE) atau ukuran > ~3500 char → pakai `ctx.replyWithDocument(new InputFile(plaintext, filename))` kirim sebagai file attachment. Atau truncate + kasih download URL via Pinata gateway. Sekalian wrap `ctx.reply`/`replyWithDocument` di try/catch yang reply graceful error ke user (bukan silent throw). Verifikasi: on-chain getDecryptionKey + Pinata fetch udah dites jalan barusan, jadi murni di reply step.
