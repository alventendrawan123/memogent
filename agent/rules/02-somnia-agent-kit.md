# Agent Rules — Somnia Agent Kit Usage

How the off-chain TypeScript agent interacts with Somnia's on-chain agent platform and Reactivity.

## Two distinct integration surfaces — don't conflate

1. **On-chain agent invocation** (LLM Inference, JSON API Request)
   - The contract calls `createRequest()` synchronously, gets callback later
   - The off-chain agent (us) does NOT directly call `inferToolsChat` — that's the CONTRACT'S job
   - Our role: build the prompt, pass it to the contract, monitor the callback event

2. **Reactivity event listening**
   - Our agent listens to `MemogentCore.RiskEscalation` and `MemogentAgent.RiskDecision` via WSS
   - We act on decisions (notify owner via Telegram, trigger Vault, etc.)

## When to call `inferToolsChat` on-chain vs reasoning off-chain

**On-chain (via Somnia LLM Inference agent):**
- The final risk score / decision (so it has consensus + audit receipt)
- Anything judges will inspect as "agent-native autonomy"

**Off-chain (in our TypeScript):**
- Prompt construction
- Signal pre-aggregation (wallet history scoring, telegram last-seen lookup)
- Result post-processing (formatting empathy messages for beneficiary)

**Rule of thumb:** if a judge needs to *verify* it, it goes on-chain. If it's plumbing, it stays off-chain.

## Building the on-chain inference payload

```typescript
import { encodeFunctionData } from 'ethers';
import { LLM_INFERENCE_ABI } from '../abi/llmInference.js';

export function buildRiskInferencePayload(signals: Signals): `0x${string}` {
    const prompt = buildPrompt(signals);
    const system = MEMOGENT_SYSTEM_PROMPT;

    return encodeFunctionData(LLM_INFERENCE_ABI, 'inferNumber', [
        prompt,
        system,
        0n,        // minValue
        100n,      // maxValue
        false,     // chainOfThought
    ]) as `0x${string}`;
}
```

Then the contract uses this payload in `createRequest()`. The off-chain agent submits a tx that triggers our contract's `requestRiskAssessment(user, payload)` function.

## Reading on-chain agent receipts (for logging)

```typescript
const receiptUrl = (requestId: bigint) =>
    `https://agents.somnia.network/receipts/${requestId}`;

const apiUrl = (requestId: bigint) =>
    `https://receipts.testnet.agents.somnia.host?requestId=${requestId}`;
```

Don't depend on receipt content for logic — receipts are *subjective* (per-node). Use them only for audit / display.

## Reactivity event listening

```typescript
import { ethers } from 'ethers';

const provider = new ethers.WebSocketProvider(config.wss);
const core = new ethers.Contract(config.coreAddress, CORE_ABI, provider);

core.on('RiskEscalation', async (user, deadlineMs, evt) => {
    logger.info({ user, deadlineMs }, 'RiskEscalation received');
    await handleEscalation(user);
});
```

## Funding & top-up loop

The agent monitors operational balance and tops up the contract automatically:

```typescript
async function ensureOperationalFloor() {
    const balance = await provider.getBalance(config.coreAddress);
    const floor = 32n * 10n ** 18n;  // 32 STT
    const buffer = 5n * 10n ** 18n;  // headroom

    if (balance < floor + buffer / 2n) {
        const topUp = floor + buffer - balance;
        await signer.sendTransaction({ to: config.coreAddress, value: topUp });
        logger.warn({ topUp: topUp.toString() }, 'Topped up operational balance');
    }
}
```

Run every block-tick or every 60s — whichever is cheaper.

## Forbidden

- ❌ Calling Claude / OpenAI / any non-Somnia LLM
- ❌ Storing reasoning text off-chain only — the *hash* must go on-chain via the receipt
- ❌ Polling RPC in a tight loop (use WSS subscriptions)
- ❌ Using `wallet.sendTransaction` without `gasLimit` and gas-price strategy
- ❌ Acting on `RiskDecision` events from a contract address you don't trust (verify event source against `config.agentAddress`)
