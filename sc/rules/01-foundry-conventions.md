# Smart Contract Rules — Foundry Conventions

Applies to all files under `d:\memogent\sc\`.

## Toolchain

- **Foundry only** — `forge`, `cast`, `anvil`. No Hardhat, no Truffle.
- Solidity compiler: **`^0.8.28`** (match SomMemo for binary-level reuse).
- Optimizer: **enabled, `runs = 200`** (SomMemo wasn't optimized; we need it because multi-contract still totals close to mainnet limit).

## Project layout

```
sc/
├── src/
│   ├── core/       MemogentCore.sol, MemogentAgent.sol
│   ├── vault/      AgentVault.sol
│   ├── capsule/    TimeCapsule.sol
│   ├── interfaces/ I*.sol  (one interface per file)
│   └── libraries/  SomniaExtensions.sol (constants)
├── test/
│   ├── *.t.sol     test files (suffix .t.sol)
│   ├── integration/E2E.t.sol
│   └── mocks/      MockSomniaPrecompile.sol, MockAgentPlatform.sol
├── script/
│   ├── Deploy.s.sol         deploys all contracts
│   └── FundContract.s.sol   tops up 32 STT
├── lib/            git submodules: forge-std, openzeppelin-contracts
├── broadcast/      auto-generated deploy logs (COMMITTED)
├── foundry.toml
└── remappings.txt
```

## File naming

- Contracts: `PascalCase.sol` (one contract per file)
- Tests: `<ContractName>.t.sol` (suffix `.t.sol` required by Foundry)
- Scripts: `<Name>.s.sol` (suffix `.s.sol` required by Foundry)
- Interfaces: `I<ContractName>.sol`

## Style

- Explicit visibility on every function (`public`, `external`, `internal`, `private`)
- NatSpec on every `external` and `public` function (`@notice`, `@param`, `@return`)
- Constants `UPPER_SNAKE_CASE`, state vars `camelCase`, internal funcs `_camelCase`
- No `console.log` in `src/` (allowed in `test/` and `script/`)
- No magic numbers — extract to named `constant`

## Dependencies

- Install via `forge install <repo>` (creates git submodule in `lib/`)
- Required:
  - `foundry-rs/forge-std`
  - `OpenZeppelin/openzeppelin-contracts` (only if a feature actually needs OZ — don't import preemptively)
- Update `remappings.txt` after every install

## Commit hygiene

- `out/` and `cache/` are gitignored
- `broadcast/` IS committed (deploy proof for judges)
- `.env` never committed — only `.env.example`

## Forbidden

- Don't introduce Hardhat config or `package.json` inside `sc/`
- Don't use experimental Solidity features (`pragma experimental` is banned)
- Don't enable `via_ir` unless we hit a contract size emergency — it changes gas behavior
