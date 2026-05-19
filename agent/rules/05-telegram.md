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

## SQLite schema (better-sqlite3)

Single DB at `agent/data/memogent.db`. Schema in `agent/src/store/migrations/001_init.sql`:

```sql
CREATE TABLE wallet_link (
    wallet_address TEXT PRIMARY KEY,
    chat_id INTEGER NOT NULL UNIQUE,
    linked_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
);

CREATE TABLE link_token (
    token TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    nonce TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE checkin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    sent_at INTEGER NOT NULL,
    responded_at INTEGER,
    response TEXT  -- 'alive' | 'busy' | NULL
);

CREATE TABLE blocked_at (
    chat_id INTEGER PRIMARY KEY,
    blocked_at INTEGER NOT NULL
);
```

## Wallet linking flow (SIWE + deep link)

1. FE/CLI: user signs SIWE message with one-time `nonce`
2. Agent: issues opaque token `link_<uuid>`, stored with 5-min TTL
3. User: opens `https://t.me/MemogentBot?start=link_<token>`
4. Bot: receives `/start link_<token>`, validates, persists `wallet_address ↔ chat_id`

**SIWE signature MUST verify against** `walletAddress` BEFORE issuing the token. Failure → 401.

## Activity middleware (drop-in)

```typescript
bot.use(async (ctx, next) => {
    if (ctx.chat?.id) {
        db.prepare(`UPDATE wallet_link SET last_seen_at = ? WHERE chat_id = ?`)
          .run(Date.now(), ctx.chat.id);
    }
    await next();
});
```

This single middleware covers ALL "user is alive" signals (text, photo, callback button). Don't add per-event listeners.

## Block detection

Two sources:

1. **`my_chat_member` event** — fires when user blocks/unblocks the bot
2. **Outbound send 403 error** — catch on every `bot.api.sendMessage`

```typescript
bot.on("my_chat_member", (ctx) => {
    if (ctx.myChatMember.new_chat_member.status === "kicked") {
        db.prepare(`INSERT OR REPLACE INTO blocked_at VALUES (?, ?)`)
          .run(ctx.chat.id, Date.now());
    }
});

async function safeSend(chatId: number, text: string, opts?: any) {
    try {
        await bot.api.sendMessage(chatId, text, opts);
    } catch (err) {
        if (err instanceof GrammyError && err.error_code === 403) {
            db.prepare(`INSERT OR REPLACE INTO blocked_at VALUES (?, ?)`)
              .run(chatId, Date.now());
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
