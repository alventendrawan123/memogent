# Deploy the Memogent agent to Railway

The agent (Telegram bot + chain event listener + autoAssess loop) is a stateless
long-running worker — perfect for Railway. State lives in Supabase, so no volume
needed. This guide gets it running 24/7.

> Config lives in `agent/railway.json`. The repo root is the monorepo; the agent
> is the `agent/` subdirectory — **you MUST set Root Directory = `agent`** in the
> Railway service settings, or the build won't find this project.

---

## 1. Prerequisites

- A Railway account (https://railway.app) — free trial credit is enough for a demo
- The GitHub repo already pushed (it is: `alventendrawan123/memogent`)
- Your `agent/.env` values handy — you'll paste them into Railway's Variables tab

---

## 2. Create the service (dashboard, ~5 min)

1. Railway dashboard → **New Project** → **Deploy from GitHub repo**
2. Pick `alventendrawan123/memogent`
3. After it imports, open the service → **Settings**:
   - **Root Directory** → set to `agent`  ← critical (monorepo)
   - Build & Start commands are read from `agent/railway.json` automatically
     (build: `pnpm install --prod=false && pnpm build`, start: `pnpm start`)
   - **Replicas** → confirm **1** (see §4 — more than 1 breaks Telegram polling)

---

## 3. Set environment variables

Service → **Variables** tab → add each of these (values from your local `agent/.env`):

| Variable | Notes |
|---|---|
| `MEMOGENT_NETWORK` | `testnet` |
| `SOMNIA_RPC` | `https://api.infra.testnet.somnia.network/` |
| `MEMOGENT_CORE_ADDRESS` | `0x01b35186AA48d2feE071BAF36b83640660A5A6DC` |
| `MEMOGENT_AGENT_ADDRESS` | `0x20b6af8924fdA1e3Ba49aeEFfE83029aC35D8867` |
| `TIME_CAPSULE_ADDRESS` | `0x15054710dE55813Db967d85fb5B09DcfDF36c9b6` |
| `SERVICE_PRIVATE_KEY` | service wallet PK (pays assessRisk gas) — keep funded |
| `TELEGRAM_BOT_TOKEN` | from @BotFather |
| `PINATA_JWT` | Pinata JWT |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `LOG_LEVEL` | `info` |
| `ACTIVITY_DEBOUNCE_MS` | `60000` |

Tip: Railway's Variables tab has a **Raw Editor** — paste your whole `.env` body
at once (minus comments) and it parses every `KEY=value`.

Secrets here are stored server-side by Railway — never logged, never in the
client. Same trust level as your local `.env`.

---

## 4. ⚠️ Only ONE bot instance may poll at a time

The Telegram bot uses long polling (`getUpdates`). Telegram allows **exactly one**
poller per bot token. If two run, you get:

```
Conflict: terminated by other getUpdates request
```

So:
- Keep **Replicas = 1** on Railway
- Once Railway is live, **STOP your local `pnpm dev`** — otherwise local + Railway
  fight over the same token and the bot flaps

For a real second environment (staging), create a separate bot via @BotFather and
use its token.

---

## 5. Deploy + verify

1. Railway auto-deploys on the first setup and on every push to `main`
2. Open the service → **Deployments** → latest → **View Logs**
3. Healthy startup looks like:

```
Memogent agent starting   network=testnet chainId=50312
Supabase connected        walletLinkCount=3
Listener subscribed to events  currentBlock=...
Telegram bot initialized  username=memogent_v1_bot
autoAssess loop starting  intervalMin=5
Telegram bot polling started
```

4. Test in Telegram: send `/status` to `@memogent_v1_bot` → it should reply. Done.

---

## 6. Common build failures

| Symptom | Cause | Fix |
|---|---|---|
| `tsc: not found` / `Cannot find module 'typescript'` | Railway set `NODE_ENV=production`, pnpm skipped devDeps | Already handled — `railway.json` build uses `pnpm install --prod=false`. If you changed it, restore the `--prod=false` |
| `No project found` / wrong files | Root Directory not set | Settings → Root Directory = `agent` |
| Bot replies then goes silent / flapping | Two pollers (local `pnpm dev` still running, or Replicas > 1) | Stop local dev; set Replicas = 1 |
| `Missing required env: SUPABASE_URL` | Variable not set | Add it in Variables tab |
| Reactivity never executes a will | That's fine — Reactivity is on-chain, independent of this agent. The agent only listens + notifies | n/a |

---

## 7. Keeping the service wallet funded

`SERVICE_PRIVATE_KEY` pays ~0.4 STT per AI assessment and per empathy message.
On testnet, top it up from the faucet (https://testnet.somnia.network/) when low.
If the wallet runs dry, assessments silently fail (logged as warnings) but
Reactivity-based execution still works.

---

## 8. Redeploy

Any push to `main` triggers an auto-deploy. To redeploy without code changes:
Railway service → **Deployments** → **⋮** → **Redeploy**.
