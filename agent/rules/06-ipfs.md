# Agent Rules — IPFS / Time Capsule

How Memogent stores and releases encrypted Time Capsule media.

> Full IPFS + Lighthouse reference: [`skill/ipfs/skill.md`](../../skill/ipfs/skill.md).
> This file = project-specific rules.

## Provider

**Lighthouse** with Kavach access control. NOT Pinata, NOT web3.storage, NOT Filebase.

Why: pay-once perpetual storage (Beacon $20 = 5GB forever) matches inheritance semantics. Built-in encryption with per-address access control means we don't roll our own ECIES.

## Library

**`@lighthouse-web3/sdk`** — first-party TypeScript SDK.

```bash
pnpm add @lighthouse-web3/sdk
```

## Encryption pattern

**Lighthouse Kavach `shareFile(beneficiaryAddr)`** — testator signs once at upload, beneficiary signs once at claim.

DO NOT:
- ❌ Use `eth_getEncryptionPublicKey` (DEPRECATED in MetaMask since 2024)
- ❌ Roll our own ECIES with `eth-crypto`
- ❌ Store decryption keys on-chain (calldata is public; storage costs gas)
- ❌ Use any pattern requiring beneficiary participation BEFORE capsule creation

## Capsule lifecycle in code

### Create (testator side, off-chain agent or FE)

```typescript
import lighthouse from "@lighthouse-web3/sdk";
import { ethers } from "ethers";

async function createCapsule(
    testator: ethers.Wallet,
    beneficiaryAddress: string,
    fileData: Buffer | string,
    apiKey: string
): Promise<string> {
    // 1. Testator signs auth (Kavach)
    const authMsg = (await lighthouse.getAuthMessage(testator.address)).data.message;
    const signedMsg = await testator.signMessage(authMsg);

    // 2. Upload encrypted
    const upload = await lighthouse.uploadEncrypted(fileData, apiKey, testator.address, signedMsg);
    const cid = upload.data[0].Hash;

    // 3. Grant beneficiary access (no participation needed)
    await lighthouse.shareFile(testator.address, [beneficiaryAddress], cid, signedMsg);

    return cid;
}
```

The returned `cid` is what gets stored in `TimeCapsule.registerCapsule(cid, beneficiary)` on-chain.

### Release signal (on-chain)

When `WillExecuted` event fires, `MemogentCore` calls `TimeCapsule.releaseCapsule(testator)`, which:
- Marks the capsule as released
- Emits `CapsuleReleased(testator, beneficiary, cid)` event

No encryption operation happens on-chain. The release is just a state flag.

### Claim (beneficiary side, web claim page — Bima's domain)

```typescript
async function claimCapsule(
    beneficiary: ethers.Wallet,
    cid: string
): Promise<Uint8Array> {
    // 1. Beneficiary signs auth — first interaction with Kavach
    const authMsg = (await lighthouse.getAuthMessage(beneficiary.address)).data.message;
    const signedMsg = await beneficiary.signMessage(authMsg);

    // 2. Fetch decryption key from Kavach (threshold network)
    const key = await lighthouse.fetchEncryptionKey(cid, beneficiary.address, signedMsg);

    // 3. Decrypt
    return await lighthouse.decryptFile(cid, key.data.key);
}
```

## File size & quota limits

| Limit | Value | Memogent implication |
|---|---|---|
| Max file size per upload | 50 MB | Single video typical; for longer, chunk on-chain (out of v1 scope) |
| Upload rate | 100/hour | More than enough |
| Encryption ops | 1000/day | Hard cap — monitor in production |
| `shareFile` calls | 500/day | Limits concurrent capsule registrations |

If we exceed: upgrade to Beacon ($20) or Navigator ($100) tier.

## Auth signature lifecycle

⚠️ Lighthouse rotates the auth message **daily**. NEVER cache `signedMsg` across days. Re-fetch + re-sign at the start of every session.

```typescript
// ❌ DO NOT cache
const signedMsg = await getSignedAuth(wallet);
// ... use repeatedly for hours ...

// ✅ DO call on every operation
async function withFreshAuth<T>(wallet: ethers.Wallet, fn: (sig: string) => Promise<T>): Promise<T> {
    const authMsg = (await lighthouse.getAuthMessage(wallet.address)).data.message;
    const sig = await wallet.signMessage(authMsg);
    return fn(sig);
}
```

## API key handling

Store `LIGHTHOUSE_API_KEY` in `agent/.env` only. NEVER:
- Hard-code in source
- Pass to frontend (they sign their own auth message)
- Log to console/file

## Failure modes

| Failure | Detection | Response |
|---|---|---|
| Upload fails (network) | `upload.data[0].Hash` undefined | Retry 3× with exponential backoff |
| `shareFile` fails | rejected promise | Critical — abort capsule creation, refund user |
| `fetchEncryptionKey` returns null | `key.data.key` undefined | Beneficiary not in access list → reject claim |
| Lighthouse SDK throws | various | Wrap in try/catch, surface to caller as `CapsuleError` |

## Persistence

Track CIDs locally for monitoring:

```sql
CREATE TABLE capsule (
    cid TEXT PRIMARY KEY,
    testator TEXT NOT NULL,
    beneficiary TEXT NOT NULL,
    onchain_registered_at INTEGER NOT NULL,
    onchain_released_at INTEGER,
    last_claim_check_at INTEGER
);
```

Used for:
- Listing capsules in agent dashboard CLI
- Detecting orphaned uploads (uploaded but not registered on-chain)
- Beneficiary notification ledger

## Forbidden

- ❌ Using Pinata, web3.storage, Filebase
- ❌ Storing encryption keys on-chain
- ❌ Rolling own ECIES with `eth-crypto`
- ❌ Caching Lighthouse auth signatures across days
- ❌ Logging the API key
- ❌ Uploading without `uploadEncrypted` (no plaintext)
- ❌ Uploading files with PII in the filename (filename is metadata, not encrypted)
