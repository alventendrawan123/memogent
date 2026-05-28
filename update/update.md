# TODO untuk Bima

> Dari tim SC/Agent · 2026-05-29

- [ ] **Fix husky pre-commit (BLOCKER — semua commit frontend ke-blokir).** Hook jalanin `biome check` tanpa path → scan seluruh frontend → 61 error pre-existing. Pilih satu:
  - `cd frontend && pnpm exec biome check --write` (auto-fix), atau
  - scope hook-nya cuma ke staged files (`git diff --cached --name-only`).

- [ ] **Commit fix MainGate.tsx** (udah di working tree, belum ke-commit). Bug "Launch App balik ke landing" udah dibenerin — redirect dibuang, ganti prompt "Connect your wallet" in-place. File udah lolos `biome check` (0 error), tinggal commit abis husky beres.

- [ ] **Pastiin `PINATA_JWT` ada di `.env.local`** (server-side, BUKAN `NEXT_PUBLIC_`). Tanpa ini step capsule upload 503. Minta JWT ke tim kalau belum punya.

- [ ] **Test `/claim/[owner]` page** pakai will yang udah executed: owner `0x7de5a9cA72456455dd83231242a0c6adA97FB4de`, beneficiary `0x4674E7e207BabF3850981aAf27B76E5D55863E69` (minta PK beneficiary ke tim buat connect). Pastiin decrypt jalan.

- [ ] **BUG Telegram-link #1 — SIWE nonce invalid.** `OnboardTelegramPage.tsx` pakai `nonce: crypto.randomUUID()`. UUID ada dash, tapi EIP-4361 mewajibkan nonce alfanumerik (no dash) → `new SiweMessage(message)` gagal: *"invalid message: max line number was 9"*. **Fix:** `import { generateNonce } from "siwe"` lalu `const nonce = generateNonce();` (udah ditest, round-trip lolos).

- [ ] **BUG Telegram-link #2 — token gak disimpan.** `app/api/telegram/link/route.ts` generate `token` terus langsung `return` tanpa insert ke tabel Supabase `link_token`. Akibatnya bot `consume(token)` gak nemu → "Token invalid or expired". **Fix:** route harus insert `{ token, wallet_address, nonce, expires_at }` (TTL ~10 menit) ke `link_token` via Supabase service_role (butuh `SUPABASE_SERVICE_ROLE_KEY` server-side di `.env.local`, BUKAN NEXT_PUBLIC). Referensi logic: `agent/src/cli/issue-token.ts` + `agent/src/db/repos/linkToken.ts`.

- [ ] **BUG dashboard — "Next deadline: in 56390 years".** Salah unit ms vs detik. `relativeTime()` di `lib/format.ts` ngarepin input **detik** (dia `* 1000`), tapi `DashboardPage.tsx:131` `const deadlineSec = willInfo?.[3]` itu `deadlineTimestamp` yang di kontrak **milidetik** → kebali-kali 1000 → tahun ~58000. **Fix:** konversi ms→detik dulu: `relativeTime(Number(deadlineMs) / 1000)` + rename var `deadlineSec` → `deadlineMs` biar gak misleading. ⚠️ JANGAN ubah `ClaimPage` `relativeTime(attachedAt)` — `attachedAt` (getCapsule[2]) itu detik, udah bener. `lastCheckIn` (willInfo[1]) juga detik, udah bener. Cuma deadline yang ms.

- [ ] **BUG History + Audit — "block range exceeds 1000" (kena 2 page).** `HistoryPage.tsx:59` & `AuditPage.tsx:75` panggil `client.getLogs({ ..., fromBlock: "earliest", toBlock: "latest" })`. Somnia RPC batesin eth_getLogs **maks 1000 block/call**; earliest→latest (~393jt block) langsung ditolak → "Could not load history". Query gagal bahkan kalau belum ada event. **Fix (rekomendasi):** ganti ke Shannon Explorer REST/Blockscout (`https://shannon-explorer.somnia.network/api/v2/addresses/{memogentAgent}/logs`, filter topic+user) — no block-range limit, agent kita udah pakai REST ini. **Alternatif:** chunk viem getLogs per ≤1000 block dari block registrasi will (bukan "earliest") sampai latest.

- [ ] **(LOW/kosmetik) Enhancement mime detection di ClaimPage.** `sniffMime` cuma deteksi ASCII murni (0x20-0x7e) sebagai teks → teks UTF-8 (em-dash "—", emoji, é, dll) ke-treat `application/octet-stream` → gak ke-render inline, cuma bisa download. Bukan bug fungsional (decrypt + hash verify tetap bener). **Fix:** coba `new TextDecoder("utf-8", { fatal: true }).decode(plaintext)` dulu — kalau gak throw, berarti teks valid → render inline; kalau throw, baru fallback ke binary/download. Terbukti pas test: capsule teks "bima round 2 — ..." ke-treat binary gara-gara em-dash.

- [ ] **Tambahin opsi Silence window pendek buat testing (5 menit).** Udah kita verifikasi: smart contract `registerWill` **gak ada minimum** — terima detik berapapun (kita test 90-300s, Reactivity fire normal). FE sekarang batesin `min(1)` hari (zod) + convert `daysToSeconds`, jadi gak bisa test full cycle (execute) cepet via FE. Tolong tambahin **preset/opsi "5 minutes (test)"** yang kirim `300` detik ke `registerWill` (bypass konversi days). Kasih label jelas "testing only" / sembunyiin di balik flag biar gak kepake user beneran. Ini biar bisa demo full cycle (register → tunggu 5 menit → execute → claim) lewat FE tanpa CLI.
