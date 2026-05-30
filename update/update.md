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
