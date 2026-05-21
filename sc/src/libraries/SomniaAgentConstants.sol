// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library SomniaAgentConstants {
    address internal constant AGENT_PLATFORM_TESTNET = 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776;
    address internal constant AGENT_PLATFORM_MAINNET = 0x5E5205CF39E766118C01636bED000A54D93163E6;

    uint256 internal constant LLM_AGENT_ID = 12847293847561029384;
    uint256 internal constant JSON_API_AGENT_ID = 13174292974160097713;
    uint256 internal constant PARSE_WEBSITE_AGENT_ID = 12875401142070969085;

    uint256 internal constant LLM_PER_AGENT_PRICE = 0.07 ether;
    uint256 internal constant JSON_API_PER_AGENT_PRICE = 0.03 ether;

    uint256 internal constant DEFAULT_SUBCOMMITTEE_SIZE = 3;
    uint256 internal constant DEFAULT_THRESHOLD = 2;

    uint256 internal constant DEPOSIT_BUFFER_PCT = 30;
}
