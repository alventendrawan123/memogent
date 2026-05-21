// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISomniaAgentPlatform} from "../interfaces/ISomniaAgentPlatform.sol";
import {IAgentCallback} from "../interfaces/IAgentCallback.sol";
import {ILLMAgent} from "../interfaces/ILLMAgent.sol";
import {Request, Response, ResponseStatus} from "../interfaces/SomniaAgentTypes.sol";
import {SomniaAgentConstants} from "../libraries/SomniaAgentConstants.sol";
import {MemogentCore} from "../core/MemogentCore.sol";

contract MemogentAgent is IAgentCallback {
    ISomniaAgentPlatform public immutable platform;
    MemogentCore public immutable core;
    address public immutable deployer;

    string public constant SYSTEM_PROMPT =
        "You are a risk classifier for an autonomous digital inheritance system. "
        "Given the wallet inactivity signal, classify the risk into exactly one of: "
        "SAFE (low risk, recent activity), "
        "WATCH (mild inactivity, monitor closely), "
        "GRACE (moderate inactivity, send warning to user), "
        "EXECUTE (critical inactivity, trigger inheritance). "
        "Respond with exactly one word from the allowed values.";

    uint256 public constant ASSESSMENT_COOLDOWN = 1 hours;

    struct PendingAssessment {
        address user;
        uint256 requestedAt;
    }

    struct RiskAssessment {
        string classification;
        uint256 assessedAt;
        uint256 requestId;
    }

    mapping(uint256 => PendingAssessment) public pendingAssessments;
    mapping(address => RiskAssessment) public latestAssessment;
    mapping(address => uint256) public lastAssessmentRequestAt;

    event AssessmentRequested(uint256 indexed requestId, address indexed user, uint256 deposit);
    event AssessmentReceived(uint256 indexed requestId, address indexed user, string classification);
    event RiskDecision(address indexed user, string classification, uint256 timestamp);
    event ExecutionTriggered(address indexed user);
    event AssessmentFailed(uint256 indexed requestId, address indexed user, ResponseStatus status);

    constructor(address _platform, address _core) {
        require(_platform != address(0), "MemogentAgent: zero platform");
        require(_core != address(0), "MemogentAgent: zero core");
        platform = ISomniaAgentPlatform(_platform);
        core = MemogentCore(payable(_core));

        deployer = msg.sender;
    }

    function assessRisk(address user) external payable returns (uint256 requestId) {
        require(user != address(0), "MemogentAgent: zero user");
        uint256 lastRequest = lastAssessmentRequestAt[user];
        if (lastRequest != 0) {
            require(
                block.timestamp >= lastRequest + ASSESSMENT_COOLDOWN,
                "MemogentAgent: cooldown active"
            );
        }
        lastAssessmentRequestAt[user] = block.timestamp;

        string memory prompt = _buildPrompt(user);

        string[] memory allowedValues = new string[](4);
        allowedValues[0] = "SAFE";
        allowedValues[1] = "WATCH";
        allowedValues[2] = "GRACE";
        allowedValues[3] = "EXECUTE";

        bytes memory payload = abi.encodeWithSelector(
            ILLMAgent.inferString.selector,
            prompt,
            SYSTEM_PROMPT,
            false,
            allowedValues
        );

        uint256 deposit = _calculateLLMDeposit();
        require(msg.value >= deposit, "MemogentAgent: insufficient deposit");

        requestId = platform.createRequest{value: deposit}(
            SomniaAgentConstants.LLM_AGENT_ID,
            address(this),
            IAgentCallback.handleResponse.selector,
            payload
        );

        pendingAssessments[requestId] = PendingAssessment({
            user: user,
            requestedAt: block.timestamp
        });

        emit AssessmentRequested(requestId, user, deposit);

        uint256 excess = msg.value - deposit;
        if (excess > 0) {
            (bool sent, ) = payable(msg.sender).call{value: excess}("");
            require(sent, "MemogentAgent: refund failed");
        }
    }

    function handleResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory /*details*/
    ) external override {
        require(msg.sender == address(platform), "MemogentAgent: not platform");

        PendingAssessment memory pending = pendingAssessments[requestId];
        require(pending.user != address(0), "MemogentAgent: unknown request");
        delete pendingAssessments[requestId];

        if (status != ResponseStatus.Success || responses.length == 0) {
            emit AssessmentFailed(requestId, pending.user, status);
            return;
        }

        string memory classification = abi.decode(responses[0].result, (string));

        latestAssessment[pending.user] = RiskAssessment({
            classification: classification,
            assessedAt: block.timestamp,
            requestId: requestId
        });

        emit AssessmentReceived(requestId, pending.user, classification);
        emit RiskDecision(pending.user, classification, block.timestamp);

        if (keccak256(bytes(classification)) == keccak256(bytes("EXECUTE"))) {
            emit ExecutionTriggered(pending.user);
            core.executeFromAgent(pending.user);
        }
    }

    function _calculateLLMDeposit() internal view returns (uint256) {
        uint256 floor = platform.getRequestDeposit();
        uint256 perAgentTotal = SomniaAgentConstants.LLM_PER_AGENT_PRICE * SomniaAgentConstants.DEFAULT_SUBCOMMITTEE_SIZE;
        uint256 buffer = (perAgentTotal * SomniaAgentConstants.DEPOSIT_BUFFER_PCT) / 100;
        return floor + perAgentTotal + buffer;
    }

    function _buildPrompt(address user) internal view returns (string memory) {
        (address owner, , uint256 lastCheckIn, uint256 inactivePeriod, , bool executed, bool active, ) = core.wills(user);
        require(owner != address(0), "MemogentAgent: no will");
        require(active, "MemogentAgent: will inactive");
        require(!executed, "MemogentAgent: already executed");

        uint256 elapsed = block.timestamp > lastCheckIn ? block.timestamp - lastCheckIn : 0;
        uint256 percent = inactivePeriod == 0 ? 0 : (elapsed * 100) / inactivePeriod;
        if (percent > 100) percent = 100;

        return string.concat(
            "Wallet inactivity: ",
            _uintToString(percent),
            " percent of inactive-period threshold elapsed. Classify the inheritance risk."
        );
    }

    function _uintToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    receive() external payable {}
}
