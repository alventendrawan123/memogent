# Agent Rules — Telegram Integration

How Memogent uses Telegram for life-proof signal (25% weight) and beneficiary notifications.

> Full Telegram + grammY reference: [`skill/telegram/skill.md`](../../skill/telegram/skill.md).
> This file = project-specific rules.

## Library

**`grammy@latest`** — NOT `telegraf` (stale since Feb 2024, only Bot API 7.1). grammY tracks Bot API 9.6+.

```bash
pnpm add grammy @grammyjs/types better-sqlite3
```

## Deployment

**Long polling only** (`bot.start()`). No webhooks. We are a single-instance 24/7 agent on a VPS; no SSL setup needed. Per grammY docs: *"If you don't have a good reason to use webhooks, there are no major drawbacks to long polling."*

⚠️ **Run only ONE bot instance per token** — concurrent `getUpdates` returns 409 Conflict.

## Supabase schema (hosted PostgreSQL)

**Switched from better-sqlite3 to Supabase on 2026-05-21** for these reasons:
- Bima's FE can query same tables via `supabase-js` (with RLS), no agent HTTP API needed
- Judges can inspect live data via Supabase dashboard during demo
- Agent server can be ephemeral (Railway/Fly.io) — no persistent volume needed

Schema lives in `agent/src/db/schema.sql` — copy contents into Supabase SQL Editor.

Agent uses **`service_role` key** (bypasses RLS). Bima's FE uses **`anon` key** + RLS policies (enabled in W3 when FE integrates).

⚠️ **NEVER** expose `service_role` key to FE/client. Only the server-side agent uses it.

### Activity middleware MUST debounce writes

Naïve `UPDATE last_seen_at` on every Telegram message → burns Supabase rate limits on chatty users. Cache last write timestamp in memory, flush only after `ACTIVITY_DEBOUNCE_MS` (default 60s) since last write per chat:

```typescript
const lastFlushAt = new Map<number, number>();

bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId) {
        const now = Date.now();
        const last = lastFlushAt.get(chatId) ?? 0;
        if (now - last >= config.activityDebounceMs) {
            lastFlushAt.set(chatId, now);
            await supabase
                .from('wallet_link')
                .update({ last_seen_at: now })
                .eq('chat_id', chatId);
        }
    }
    await next();
});
```

## Wallet linking flow (SIWE + deep link)

1. FE/CLI: user signs SIWE message with one-time `nonce`
2. Agent: issues opaque token `link_<uuid>`, stored with 5-min TTL
3. User: opens `https://t.me/MemogentBot?start=link_<token>`
4. Bot: receives `/start link_<token>`, validates, persists `wallet_address ↔ chat_id`

**SIWE signature MUST verify against** `walletAddress` BEFORE issuing the token. Failure → 401.

## Activity middleware coverage

The debounced middleware above covers ALL "user is alive" signals (text, photo, callback button) — they all carry `ctx.chat.id` for private chats. Don't add per-event listeners.

## Block detection

Two sources:

1. **`my_chat_member` event** — fires when user blocks/unblocks the bot
2. **Outbound send 403 error** — catch on every `bot.api.sendMessage`

```typescript
bot.on("my_chat_member", async (ctx) => {
    if (ctx.myChatMember.new_chat_member.status === "kicked") {
        await supabase
            .from('blocked_chat')
            .upsert({ chat_id: ctx.chat.id, blocked_at: Date.now() });
    }
});

async function safeSend(chatId: number, text: string, opts?: any) {
    try {
        await bot.api.sendMessage(chatId, text, opts);
    } catch (err) {
        if (err instanceof GrammyError && err.error_code === 403) {
            await supabase
                .from('blocked_chat')
                .upsert({ chat_id: chatId, blocked_at: Date.now() });
            logger.warn({ chatId }, "user blocked the bot");
        } else throw err;
    }
}
```

⚠️ **NEVER** call `bot.api.sendMessage` directly. Always `safeSend`. Bare send doesn't capture block state.

## When to send messages

| Trigger | Recipient | Content |
|---|---|---|
| GRACE entered | Owner | "We haven't seen activity. Tap below to confirm you're OK." + inline button |
| Daily during grace | Owner | Reminder with countdown |
| User answers check-in | Owner | "Acknowledged ✓" |
| EXECUTE finalized | Beneficiary (if linked) | Empathetic message + capsule claim link |
| User blocks bot | — | (no msg, just log; treat Telegram signal as missing) |

## When user blocks the bot

Telegram signal weight (25%) **redistributes** to wallet (40%→53%) and check-in (35%→47%) — see `agent/rules/03-signals.md`.

Don't treat blocking as "user is dead." It's a missing signal, not a positive death signal.

## Beneficiary who hasn't linked

**You CANNOT message a Telegram user the bot has never seen.** No API for unsolicited contact.

If beneficiary's `telegram_handle` is stored in `TimeCapsule` metadata:
- On EXECUTE: check `wallet_link` table for beneficiary address
- If present → `safeSend` empathy message + claim link
- If absent → emit on-chain `WillExecuted` only; beneficiary discovers via Bima's FE claim page

## Rate limits (memorize)

| Scope | Limit |
|---|---|
| Per single chat | 1 message/sec |
| Group chat | 20 messages/min |
| Broadcast across chats | ~30/sec free, 1000/sec paid |

For mass EXECUTE day: well within free limits.

## Bot username

⚠️ Reserve `@MemogentBot` (or chosen alternative) via `@BotFather` on Telegram **before Workshop 1 (2026-05-22)**. Judges may try to ping it during demo.

## Forbidden

- ❌ Using `telegraf` (use grammy)
- ❌ Running multiple bot instances on same token
- ❌ `bot.api.sendMessage` without `safeSend` wrapper
- ❌ Using `getChat`/`getChatMember` to detect blocks (doesn't work)
- ❌ Storing SIWE-derived state without nonce/expiry
- ❌ Sending messages to beneficiary who hasn't started the bot
- ❌ Triggering on-chain agent calls from inside bot handlers — too slow, decouple via event queue
