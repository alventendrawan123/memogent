# sc/

Smart contracts for Memogent — Foundry project. Will-registry, AI-decision receipts, multi-stage vault, and IPFS time capsule on Somnia.

## Layout (planned for W1)

| Path | Purpose |
|---|---|
| [rules/](./rules/) | Project conventions — read before coding |
| `src/core/` | `MemogentCore.sol`, `MemogentAgent.sol` |
| `src/vault/` | `AgentVault.sol` (daily/weekly limits) |
| `src/capsule/` | `TimeCapsule.sol` (IPFS pointers) |
| `src/interfaces/` | `ISomniaReactivity`, `IMemogentAgent`, etc. |
| `src/libraries/` | `SomniaExtensions.sol` (constants) |
| `test/` | Foundry `.t.sol` tests + mocks |
| `script/` | `Deploy.s.sol`, `FundContract.s.sol` |
| `foundry.toml` | Network config (Somnia testnet 50312) |
| `.env.example` | `PRIVATE_KEY`, `SOMNIA_RPC_URL` |

## Status

W1 (current): rules drafted. Foundry init + contract porting from SomMemo starts next.

See [docs/flow.md](../docs/flow.md) §1, §4-§6 for contract responsibilities and inter-contract flow.
