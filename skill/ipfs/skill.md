# IPFS Skill — Reference for Memogent Time Capsule

> Authoritative reference for IPFS storage and capsule encryption.
> Sources: https://docs.lighthouse.storage/ + https://github.com/lighthouse-web3/encryption-sdk (fetched 2026-05-14)
> Provider decision: **Lighthouse**, NOT Pinata or web3.storage

---

## 1. Locked decisions

| Topic | Decision | Reason |
|---|---|---|
| Provider | **Lighthouse** | Pay-once perpetual storage (Beacon $20 = 5GB forever); pivotal for "claim in 10 years" use case |
| SDK | `@lighthouse-web3/sdk` | First-party TypeScript SDK |
| Encryption | **Lighthouse Kavach** `shareFile(beneficiaryAddr)` | Beneficiary signs at claim time, NO prior participation needed |
| On-chain key storage | **NOT used** | MetaMask deprecated `eth_getEncryptionPublicKey` (2024); rolling own ECIES is fragile |
| Symmetric key custody | Kavach threshold network (5 nodes) | Off-chain, off-server, no single point of failure |
| Pinning verification | Skip for v1 (Lighthouse handles) | Trust their persistence guarantee for $20 tier |

---

## 2. Why NOT Pinata, web3.storage, Filebase

| Provider | Issue |
|---|---|
| **Pinata** | Recurring billing — capsule lapses if account expires. Free tier shrank in 2026 (1 GB storage, 10 GB bandwidth, 10k requests/month). Bandwidth metering = cost trap for inheritance use case. |
| **web3.storage** | **Discontinued/rebranded to Storacha** with enterprise focus. Do not use. |
| **Filebase** | Recurring billing. S3-compatible API but no built-in encryption or access control. |

Lighthouse wins because **(a)** pay-once perpetual = matches inheritance semantics, **(b)** built-in access control = no DIY crypto.

---

## 3. Library setup

```bash
pnpm add @lighthouse-web3/sdk
```

```typescript
// agent/src/ipfs/lighthouse.ts
import lighthouse from "@lighthouse-web3/sdk";
import { ethers } from "ethers";
import { config } from "../config.js";

export async function getAuthSignature(wallet: ethers.Wallet): Promise<string> {
    const authMessage = await lighthouse.getAuthMessage(wallet.address);
    return await wallet.signMessage(authMessage.data.message);
}
```

---

## 4. Upload + share flow (capsule creation)

```typescript
import lighthouse from "@lighthouse-web3/sdk";

export async function createCapsule(
    testator: ethers.Wallet,
    beneficiaryAddress: string,
    fileBuffer: Buffer | string,  // Buffer or filepath
    apiKey: string
): Promise<{ cid: string }> {
    // 1. Testator signs ONCE (Kavach auth)
    const signedMessage = await getAuthSignature(testator);

    // 2. Upload encrypted (Kavach handles symmetric key + storage)
    const uploadResponse = await lighthouse.uploadEncrypted(
        fileBuffer,
        apiKey,
        testator.address,
        signedMessage
    );
    const cid = uploadResponse.data[0].Hash;

    // 3. Share with beneficiary — they don't exist on Lighthouse yet,
    //    they just need to sign at claim time
    await lighthouse.shareFile(
        testator.address,
        [beneficiaryAddress],   // string[]
        cid,
        signedMessage
    );

    return { cid };
}
```

The `cid` is what Memogent stores in `TimeCapsule.sol`. No encryption key is stored on-chain.

---

## 5. Beneficiary claim flow

```typescript
export async function claimCapsule(
    beneficiary: ethers.Wallet,
    cid: string
): Promise<Uint8Array> {
    // 1. Beneficiary signs at claim time (NO prior participation needed)
    const beneficiarySig = await getAuthSignature(beneficiary);

    // 2. Fetch decryption key from Kavach threshold network
    const keyObject = await lighthouse.fetchEncryptionKey(
        cid,
        beneficiary.address,
        beneficiarySig
    );

    // 3. Decrypt the file
    const decryptedBlob = await lighthouse.decryptFile(cid, keyObject.data.key);
    return new Uint8Array(decryptedBlob);
}
```

The frontend (Bima's domain) wraps this in a "Claim Capsule" button after `WillExecuted` event fires.

---

## 6. Why this works without prior beneficiary participation

The key insight: Kavach doesn't NEED to know the beneficiary's public key at upload time. The encryption key is split into 5 shards across Kavach nodes. At claim time:
1. Beneficiary signs an auth message
2. Kavach's nodes verify the signature matches one of the addresses in the file's access list
3. Threshold cryptography (3-of-5) releases shards
4. Beneficiary reconstructs the symmetric key
5. Decryption happens client-side

**No private key from beneficiary is ever revealed to Lighthouse.**

Contrast with naive ECIES-to-pubkey:
- Requires beneficiary's pubkey at upload time → beneficiary must be online
- Requires `eth_getEncryptionPublicKey` (DEPRECATED in MetaMask)
- Or requires beneficiary to have signed something previously → defeats inheritance UX

---

## 7. Pricing tiers (as of 2026)

| Tier | Cost | Storage | Use case |
|---|---|---|---|
| Free | $0 | 100 MB | Dev / testing |
| Beacon | $20 (one-time) | 5 GB perpetual | **Memogent demo + early users** |
| Navigator | $100 (one-time) | 25 GB perpetual | Production |
| Harbor | $500 (one-time) | 100 GB perpetual | Heavy media users |

For hackathon: use the Free tier (sufficient for demo). Disclose tier choice in pitch.

---

## 8. API quotas

| Limit | Free tier |
|---|---|
| Max file size per upload | 50 MB |
| Upload rate | 100 uploads/hour |
| Encryption operations | 1000/day |
| `shareFile` calls | 500/day |
| Decrypt operations (for beneficiaries) | Unlimited |

For Memogent demo: well within limits.

---

## 9. Critical gotchas

- ⚠️ The auth signature is **session-scoped** — Lighthouse rotates the auth message daily. Don't cache `signedMessage` across days.
- ⚠️ `shareFile` is idempotent — calling twice with same beneficiary is safe (no duplicate, no error).
- ⚠️ Beneficiary can call `fetchEncryptionKey` ONLY if they're in the access list. Adding them via `shareFile` is one-way.
- ⚠️ Lighthouse may not respect IPFS pinning forever in the free tier — Beacon+ tiers are required for "permanent" claims.
- ⚠️ Symmetric key NEVER leaves Kavach network. If Kavach goes down → capsule unrecoverable. Hackathon-acceptable but production needs a backup encryption path (e.g., user-held QR-code key shard).
- ⚠️ File metadata (size, content-type) is NOT encrypted — only the file body is. Don't put PII in the filename.
- ⚠️ `uploadEncrypted` accepts string filepath OR Buffer — be explicit in types.

---

## 10. Memogent contract integration

`TimeCapsule.sol` only stores the `cid` and `beneficiary` address:

```solidity
struct Capsule {
    address testator;
    address beneficiary;
    string cid;             // IPFS CID — Lighthouse hosts encrypted blob
    uint64 createdAt;
    bool released;
}

mapping(address => Capsule) public capsules;

function registerCapsule(string calldata cid, address beneficiary) external {
    require(beneficiary != address(0) && beneficiary != msg.sender, "invalid beneficiary");
    capsules[msg.sender] = Capsule({
        testator: msg.sender,
        beneficiary: beneficiary,
        cid: cid,
        createdAt: uint64(block.timestamp),
        released: false
    });
    emit CapsuleRegistered(msg.sender, beneficiary, cid);
}

// Called by MemogentCore when WillExecuted fires
function releaseCapsule(address testator) external {
    require(msg.sender == address(memogentCore), "only core");
    Capsule storage c = capsules[testator];
    require(!c.released, "already released");
    c.released = true;
    emit CapsuleReleased(testator, c.beneficiary, c.cid);
}
```

The encryption key release happens off-chain via Kavach when beneficiary calls `fetchEncryptionKey`. The contract just signals "this capsule is now claimable."

---

## 11. Useful URLs

| Topic | URL |
|---|---|
| Lighthouse docs | https://docs.lighthouse.storage/ |
| Lighthouse pricing | https://www.lighthouse.storage/pricing |
| Lighthouse SDK npm | https://www.npmjs.com/package/@lighthouse-web3/sdk |
| Lighthouse secure-share guide | https://www.lighthouse.storage/blogs/Secure%20File%20Sharing%20using%20Lighthouse%20SDK |
| Kavach encryption SDK | https://github.com/lighthouse-web3/encryption-sdk |
| MetaMask ECIES deprecation | https://metamask.io/news/developers/metamask-api-method-deprecation/ |
| ERC-5630 (deprecated) | https://eips.ethereum.org/EIPS/eip-5630 |

---

*Last updated: 2026-05-14.*
