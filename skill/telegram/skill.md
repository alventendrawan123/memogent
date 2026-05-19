# Telegram Bot Skill — Reference for Memogent

> Authoritative reference for the Telegram side of Memogent's life-proof signal.
> Sources: https://core.telegram.org/bots/api + https://grammy.dev/ (fetched 2026-05-14)
> Library decision: **grammY**, NOT telegraf (telegraf stale since Feb 2024)

---

## 1. Locked decisions

| Topic | Decision | Reason |
|---|---|---|
| Library | **`grammy@latest`** | Bot API 9.6+ active; telegraf only supports API 7.1 |
| Deployment | **Long polling** (`bot.start()`) | Single instance, <100 users, no SSL hassle |
| Persistence | **`better-sqlite3`** | Fastest sync SQLite for Node |
| Wallet binding | **SIWE + opaque link token** via `/start <token>` deep link | Standard EIP-4361, replay-safe |
| Block detection | `my_chat_member` event + 403 catch on outbound | Only reliable source |
| Concurrency | Default sequential `bot.start()` | `@grammyjs/runner` only needed if >hundreds of broadcasts |

---

## 2. Library setup

```bash
pnpm add grammy @grammyjs/types better-sqlite3
pnpm add -D @types/better-sqlite3
```

```typescript
// agent/src/telegram/bot.ts
import { Bot, GrammyError, HttpError } from "grammy";
import { config } from "../config.js";

export const bot = new Bot(config.telegramBotToken);

bot.catch((err) => {
    if (err.error instanceof GrammyError && err.error.error_code === 403) {
        // user blocked the bot — handled via my_chat_member elsewhere
        return;
    }
    if (err.error instanceof HttpError) {
        // network issue — telegraf would crash here; grammY surfaces explicitly
        return;
    }
    throw err;  // re-throw genuine bugs
});

bot.start();  // long polling, no SSL/webhook needed
```

---

## 3. Rate limits (memorize)

From [Telegram Bot FAQ](https://core.telegram.org/bots/faq):

| Scope | Limit |
|---|---|
| Single chat | 1 message/sec |
| Group chat | 20 messages/minute |
| Broadcast (across all chats) | ~30/sec free, 1000/sec paid (0.1 Stars per extra) |

Memogent worst case (mass EXECUTE day): hundreds of beneficiary messages — easily within 30/sec.

---

## 4. Update types we use

| Event | Memogent use |
|---|---|
| `message` | "user is alive" — any text/photo from user updates `last_seen_at` |
| `callback_query` | inline button presses (the "I'm alive" check-in buttons) |
| `my_chat_member` | bot blocked/unblocked — ONLY reliable block detection |

There is NO `is_blocked` field on `getChat`/`getChatMember`. Don't query — listen to `my_chat_member` and 403 errors instead.

---

## 5. Activity middleware — drop-in

Updates `last_seen_at` on ANY incoming update from a linked wallet:

```typescript
import { Context, MiddlewareFn } from "grammy";
import { db } from "../store/db.js";

export const activityMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId) {
        db.prepare(
            `UPDATE wallet_link SET last_seen_at = ? WHERE chat_id = ?`
        ).run(Date.now(), chatId);
    }
    await next();
};

bot.use(activityMiddleware);
```

Covers `message`, `edited_message`, `callback_query` — all carry `ctx.chat` for private chats.

---

## 6. Wallet ↔ chatId binding (SIWE-adapted)

Standard pattern: user signs a SIWE message off-bot, then opens a deep-link to the bot with a one-time token.

### Step 1 — Off-bot (frontend or CLI): user signs SIWE

```typescript
// SIWE message (EIP-4361 standard)
import { SiweMessage } from "siwe";

const siwe = new SiweMessage({
    domain: "memogent.xyz",
    address: walletAddress,
    statement: "Link Telegram for Memogent life-proof",
    uri: "https://memogent.xyz",
    version: "1",
    chainId: 50312,
    nonce: crypto.randomUUID(),
    issuedAt: new Date().toISOString(),
});
const signature = await wallet.signMessage(siwe.prepareMessage());
```

### Step 2 — Agent issues short-lived link token

```typescript
// agent/src/telegram/link.ts
function issueLinkToken(walletAddress: string, signature: string): string {
    const token = `link_${crypto.randomUUID().replace(/-/g, "")}`;
    db.prepare(`
        INSERT INTO link_token (token, wallet_address, nonce, expires_at)
        VALUES (?, ?, ?, ?)
    `).run(token, walletAddress, nonce, Date.now() + 5 * 60 * 1000);  // 5-min TTL
    return token;
}
```

### Step 3 — User opens `https://t.me/MemogentBot?start=link_a1b2c3`

Telegram delivers this as `/start link_a1b2c3` to the bot.

```typescript
bot.command("start", async (ctx) => {
    const token = ctx.match.trim();
    if (!token.startsWith("link_")) {
        await ctx.reply("Welcome to Memogent! Visit memogent.xyz to link your wallet.");
        return;
    }

    const row = db.prepare(`
        SELECT wallet_address, expires_at FROM link_token WHERE token = ?
    `).get(token) as { wallet_address: string; expires_at: number } | undefined;

    if (!row || row.expires_at < Date.now()) {
        await ctx.reply("⚠️ Link expired. Please re-initiate from the app.");
        return;
    }

    // Persist binding
    db.prepare(`
        INSERT OR REPLACE INTO wallet_link (wallet_address, chat_id, linked_at, last_seen_at)
        VALUES (?, ?, ?, ?)
    `).run(row.wallet_address, ctx.chat.id, Date.now(), Date.now());

    // Consume the token
    db.prepare(`DELETE FROM link_token WHERE token = ?`).run(token);

    await ctx.reply(`✅ Linked wallet ${row.wallet_address.slice(0, 6)}... to this chat. I'll check on you periodically.`);
});
```

---

## 7. SQLite schema

```sql
CREATE TABLE IF NOT EXISTS wallet_link (
    wallet_address TEXT PRIMARY KEY,
    chat_id INTEGER NOT NULL UNIQUE,
    linked_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS link_token (
    token TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    nonce TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS checkin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    sent_at INTEGER NOT NULL,
    responded_at INTEGER,
    response TEXT  -- 'alive' | 'busy' | NULL
);

CREATE TABLE IF NOT EXISTS blocked_at (
    chat_id INTEGER PRIMARY KEY,
    blocked_at INTEGER NOT NULL
);
```

---

## 8. Detecting blocks

```typescript
bot.on("my_chat_member", (ctx) => {
    const newStatus = ctx.myChatMember.new_chat_member.status;
    if (newStatus === "kicked") {
        db.prepare(`
            INSERT OR REPLACE INTO blocked_at VALUES (?, ?)
        `).run(ctx.chat.id, Date.now());
    } else if (newStatus === "member") {
        // user unblocked — clear flag
        db.prepare(`DELETE FROM blocked_at WHERE chat_id = ?`).run(ctx.chat.id);
    }
});
```

Wrap every outbound message in try/catch — `GrammyError` with `error_code === 403` means blocked:

```typescript
async function safeSend(chatId: number, text: string) {
    try {
        await bot.api.sendMessage(chatId, text);
    } catch (err) {
        if (err instanceof GrammyError && err.error_code === 403) {
            db.prepare(`
                INSERT OR REPLACE INTO blocked_at VALUES (?, ?)
            `).run(chatId, Date.now());
        } else {
            throw err;
        }
    }
}
```

---

## 9. Periodic check-in (the "I'm alive" prompt)

```typescript
import { InlineKeyboard } from "grammy";

async function sendCheckIn(chatId: number, walletAddress: string) {
    const keyboard = new InlineKeyboard()
        .text("✅ I'm alive", `alive:${walletAddress}`)
        .text("⏳ Just busy", `busy:${walletAddress}`);

    await safeSend(chatId, "Quick check — are you still active?", { reply_markup: keyboard });

    db.prepare(`
        INSERT INTO checkin (wallet_address, sent_at) VALUES (?, ?)
    `).run(walletAddress, Date.now());
}

bot.callbackQuery(/^(alive|busy):(.+)$/, async (ctx) => {
    const [, response, walletAddress] = ctx.match!;
    db.prepare(`
        UPDATE checkin SET responded_at = ?, response = ?
        WHERE wallet_address = ? AND responded_at IS NULL
    `).run(Date.now(), response, walletAddress);
    await ctx.answerCallbackQuery("Thanks — noted ✓");
});
```

---

## 10. Beneficiary who hasn't linked

**You CANNOT message a Telegram user the bot has never seen.** No API for unsolicited contact by phone/username.

Pattern: at capsule creation, optionally store `beneficiary.telegram_handle` as metadata. On EXECUTE:
- If `wallet_link` row exists for beneficiary → DM them
- Otherwise → emit on-chain event only; beneficiary discovers via the web claim page (Bima's FE)

---

## 11. Critical gotchas

- ⚠️ Bot username `@MemogentBot` (or similar) must be reserved via BotFather **before** demo day
- ⚠️ Never use `getChat`/`getChatMember` to detect blocks — they don't tell you. Use `my_chat_member` + 403 catch.
- ⚠️ Long-polling concurrent from same token = `409 Conflict` from Telegram. Run only ONE agent instance.
- ⚠️ `ctx.match` is `string` or `RegExpMatchArray | undefined` depending on whether the handler uses regex. Type-check accordingly.
- ⚠️ Never `bot.use(somethingThatThrows)` without try/catch — middleware errors crash long-polling loop.
- ⚠️ Wrap every outbound send in `safeSend()` — bare `bot.api.sendMessage` doesn't handle 403 gracefully.

---

## 12. Useful URLs

| Topic | URL |
|---|---|
| Bot API reference | https://core.telegram.org/bots/api |
| Bot API changelog | https://core.telegram.org/bots/api-changelog |
| grammY docs | https://grammy.dev/ |
| grammY deployment guide | https://grammy.dev/guide/deployment-types |
| grammY vs telegraf | https://grammy.dev/resources/comparison |
| BotFather (create bot) | `@BotFather` on Telegram |
| SIWE (EIP-4361) | https://eips.ethereum.org/EIPS/eip-4361 |

---

*Last updated: 2026-05-14. Re-check before any production deploy.*
