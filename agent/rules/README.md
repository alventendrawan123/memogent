# agent/rules/

Project-level conventions for everything under `d:\memogent\agent\`. Read in order before coding.

| # | File | Topic |
|---|---|---|
| 01 | [typescript.md](./01-typescript.md) | Runtime, layout, style, dependencies |
| 02 | [somnia-agent-kit.md](./02-somnia-agent-kit.md) | On-chain agent invocation vs off-chain reasoning |
| 03 | [signals.md](./03-signals.md) | Multi-signal collection (wallet 40%, checkin 35%, telegram 25%) |
| 04 | [decisions.md](./04-decisions.md) | Decision output, on-chain receipts, reasoning hash |

Defer to:
1. `skill/somnia/skill.md` for Somnia API contracts
2. `sc/rules/03-somnia-agents.md` for the contract-side counterpart
3. `docs/flow.md` for the end-to-end system flow
