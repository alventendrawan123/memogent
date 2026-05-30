![alt text](image.png)# TODO untuk Bima

> Dari tim SC/Agent · 2026-05-29

> **Update Bima · 2026-05-30:** item di bawah udah dikerjain Claude. Status di tiap baris.

- [x] **Fix husky pre-commit.** Hook sekarang `cd frontend && pnpm exec biome check --staged --no-errors-on-unmatched` — cuma scan file yg staged, bukan seluruh frontend. Plus biome check seluruh project udah **0 error** (67 files), jadi blocker 61-error udah hilang.

- [x] **Fix MainGate.tsx.** Redirect `router.replace("/")` dibuang total, tinggal prompt "Connect your wallet to continue." in-place. (Belum di-commit — nunggu user bilang commit push.)

- [x] **`PINATA_JWT` udah ada di `.env.local`** (server-side, non-`NEXT_PUBLIC`). Capsule upload aman.

- [ ] **Test `/claim/[owner]` page** pakai will yang udah executed: owner `0x7de5a9cA72456455dd83231242a0c6adA97FB4de`, beneficiary `0x4674E7e207BabF3850981aAf27B76E5D55863E69` (minta PK beneficiary ke tim buat connect). Pastiin decrypt jalan. → **Masih manual, butuh PK beneficiary dari tim.** Kode decrypt + mime fix (bawah) udah siap.

- [x] **BUG Telegram-link #1 — SIWE nonce.** Udah beres sejak migrasi ke viem: `OnboardTelegramPage.tsx` pakai `createSiweMessage` (viem/siwe) + `nonce = crypto.randomUUID().replace(/-/g, "")` (alfanumerik, no dash). Round-trip lolos. (Pakai viem, bukan lib `siwe`, jadi `generateNonce` gak dipakai.)

- [⚠] **BUG Telegram-link #2 — token gak disimpan.** Kode FIXED: `app/api/telegram/link/route.ts` sekarang insert `{ token, wallet_address: parsed.address, nonce: parsed.nonce, expires_at: Date.now()+10min, inviter_wallet: null }` ke tabel `link_token` via `src/lib/supabase-admin.ts` (service_role client). **ACTION:** set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (server-side, non-`NEXT_PUBLIC`) di `.env.local`. Tanpa env itu route balikin 503 (graceful, gak crash).

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

- [⚠] **`Erc20DepositForm` impl di `OnboardDepositPage.tsx`** (sebelumnya stub "Coming soon"). Mirror pola `SttDepositForm` (balance + max button) + `NftDepositForm` (2-step approve→deposit):
  - `useReadContract(erc20Abi.balanceOf)` buat baca saldo per token
  - `parseUnits(amount, token.decimals)` (bukan `parseEther`) — handle decimals per token
  - Step state `approve → deposit → done` dengan auto-transition lewat `useWaitForTransactionReceipt`
  - Switch token reset step ke "approve" (fresh approval per token)
  - Validasi "Insufficient balance" pakai `formatUnits` per decimals

  **Reviewable patches:** `ERC20_TOKENS` array sekarang nyimpen `address` + `decimals` dari `MOCK_TOKENS`, parent `Tabs.Content value="erc20"` di-pass `onDone={() => router.push("/onboard/telegram")}` biar konsisten sama STT/NFT.

  **Catatan lint:** dua warning biome kosmetik (`bg-black/[0.05]` → `bg-black/5`, `break-words` → `wrap-break-word`) sengaja **gak gw apply** — pola yang sama dipakai di SttDepositForm/NftDepositForm lama, biar konsisten sama style codebase lo. Kalau lo prefer canonical, refactor project-wide sekalian.

  Boleh lo refine/rewrite kalau ada bug atau style mismatch — gw bikin biar test deposit BTC/USDC/USDT bisa jalan end-to-end di FE.
