# sc/rules/

Project-level conventions for everything under `d:\memogent\sc\`. Read in order before coding.

| # | File | Topic |
|---|---|---|
| 01 | [foundry-conventions.md](./01-foundry-conventions.md) | Toolchain, layout, naming, style |
| 02 | [somnia-reactivity.md](./02-somnia-reactivity.md) | Precompile, Schedule events, gotchas |
| 03 | [somnia-agents.md](./03-somnia-agents.md) | createRequest, handleResponse, agent IDs, deposits |
| 04 | [architecture.md](./04-architecture.md) | 4-contract split, comms patterns |
| 05 | [security.md](./05-security.md) | CEI, ReentrancyGuardTransient, SafeERC20, vault limits |
| 06 | [foundry-testing.md](./06-foundry-testing.md) | Mock precompile + agent platform, fuzz, invariants |

When in doubt, defer to:
1. SomMemo proven patterns (`reference/SomMemo/`)
2. `skill/somnia/skill.md`
3. Official docs (https://docs.somnia.network/)
