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
        "Given the wallet inactivity signal and any extra signals provided, classify the risk into exactly one of: "
        "SAFE (low risk, recent activity), "
        "WATCH (mild inactivity, monitor closely), "
        "GRACE (moderate inactivity, send warning to user), "
        "EXECUTE (critical inactivity, trigger inheritance). "
        "Weigh ALL signals together. Respond with exactly one word from the allowed values.";

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

    mapping(uint256 => address) public pendingEmpathy;
    mapping(address => string) public empathyMessages;

    string public constant EMPATHY_SYSTEM_PROMPT =
        "You are writing a brief final farewell in the voice of a person whose digital will just executed automatically. "
        "The person has gone inactive for an extended period and the inheritance has transferred to their named beneficiary. "
        "Write 2 to 4 short, warm, sincere sentences directly addressing the beneficiary. "
        "Do not be melodramatic. Sound natural, like a hastily-written note. "
        "Do not include placeholders, names, or addresses. Use 'I' and 'you'. Avoid cliches.";

    event AssessmentRequested(uint256 indexed requestId, address indexed user, uint256 deposit);
    event AssessmentRequestedWithContext(uint256 indexed requestId, address indexed user, string contextSummary);
    event AssessmentReceived(uint256 indexed requestId, address indexed user, string classification);
    event RiskDecision(address indexed user, string classification, uint256 timestamp);
    event ExecutionTriggered(address indexed user);
    event ExecutionRejectedByCore(address indexed user, string reason);
    event AssessmentFailed(uint256 indexed requestId, address indexed user, ResponseStatus status);

    event EmpathyMessageRequested(uint256 indexed requestId, address indexed user, uint256 deposit);
    event EmpathyMessageGenerated(address indexed user, string message);
    event EmpathyMessageFailed(uint256 indexed requestId, address indexed user, ResponseStatus status);

    constructor(address _platform, address _core) {
        require(_platform != address(0), "MemogentAgent: zero platform");
        require(_core != address(0), "MemogentAgent: zero core");
        platform = ISomniaAgentPlatform(_platform);
        core = MemogentCore(payable(_core));

        deployer = msg.sender;
    }

    function assessRisk(address user) external payable returns (uint256 requestId) {
        return _dispatchAssess(user, "");
    }

    function assessRiskWithContext(
        address user,
        string calldata extraSignals
    ) external payable returns (uint256 requestId) {
        return _dispatchAssess(user, extraSignals);
    }

    function _dispatchAssess(address user, string memory extraSignals) internal returns (uint256 requestId) {
        require(user != address(0), "MemogentAgent: zero user");
        uint256 lastRequest = lastAssessmentRequestAt[user];
        if (lastRequest != 0) {
            require(
                block.timestamp >= lastRequest + ASSESSMENT_COOLDOWN,
                "MemogentAgent: cooldown active"
            );
        }
        lastAssessmentRequestAt[user] = block.timestamp;

        string memory prompt = _buildPrompt(user, extraSignals);

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
        if (bytes(extraSignals).length > 0) {
            emit AssessmentRequestedWithContext(requestId, user, extraSignals);
        }

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

        address empathyUser = pendingEmpathy[requestId];
        if (empathyUser != address(0)) {
            _handleEmpathyResponse(requestId, empathyUser, responses, status);
            return;
        }

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
            try core.executeFromAgent(pending.user) {
                // success
            } catch Error(string memory reason) {
                emit ExecutionRejectedByCore(pending.user, reason);
            } catch {
                emit ExecutionRejectedByCore(pending.user, "core rejected (no reason)");
            }
        }
    }

    function _handleEmpathyResponse(
        uint256 requestId,
        address user,
        Response[] memory responses,
        ResponseStatus status
    ) internal {
        delete pendingEmpathy[requestId];

        if (status != ResponseStatus.Success || responses.length == 0) {
            emit EmpathyMessageFailed(requestId, user, status);
            return;
        }

        string memory message = abi.decode(responses[0].result, (string));
        empathyMessages[user] = message;
        emit EmpathyMessageGenerated(user, message);
    }

    function generateEmpathyMessage(address user) external payable returns (uint256 requestId) {
        require(user != address(0), "MemogentAgent: zero user");

        (address owner, , , , bool executed, ) = core.getWillInfo(user);
        require(owner != address(0), "MemogentAgent: no will");
        require(executed, "MemogentAgent: will not yet executed");
        require(bytes(empathyMessages[user]).length == 0, "MemogentAgent: message already generated");

        string[] memory roles = new string[](2);
        roles[0] = "system";
        roles[1] = "user";

        string[] memory messages = new string[](2);
        messages[0] = EMPATHY_SYSTEM_PROMPT;
        messages[1] = "Write the farewell note now. Address the beneficiary as 'you'. Keep it brief.";

        bytes memory payload = abi.encodeWithSelector(
            ILLMAgent.inferChat.selector,
            roles,
            messages,
            false
        );

        uint256 deposit = _calculateLLMDeposit();
        require(msg.value >= deposit, "MemogentAgent: insufficient deposit");

        requestId = platform.createRequest{value: deposit}(
            SomniaAgentConstants.LLM_AGENT_ID,
            address(this),
            IAgentCallback.handleResponse.selector,
            payload
        );

        pendingEmpathy[requestId] = user;
        emit EmpathyMessageRequested(requestId, user, deposit);

        uint256 excess = msg.value - deposit;
        if (excess > 0) {
            (bool sent, ) = payable(msg.sender).call{value: excess}("");
            require(sent, "MemogentAgent: refund failed");
        }
    }

    function _calculateLLMDeposit() internal view returns (uint256) {
        uint256 floor = platform.getRequestDeposit();
        uint256 perAgentTotal = SomniaAgentConstants.LLM_PER_AGENT_PRICE * SomniaAgentConstants.DEFAULT_SUBCOMMITTEE_SIZE;
        uint256 buffer = (perAgentTotal * SomniaAgentConstants.DEPOSIT_BUFFER_PCT) / 100;
        return floor + perAgentTotal + buffer;
    }

    function _buildPrompt(address user, string memory extraSignals) internal view returns (string memory) {
        (address owner, , uint256 lastCheckIn, uint256 inactivePeriod, , bool executed, bool active, ) = core.wills(user);
        require(owner != address(0), "MemogentAgent: no will");
        require(active, "MemogentAgent: will inactive");
        require(!executed, "MemogentAgent: already executed");

        uint256 elapsed = block.timestamp > lastCheckIn ? block.timestamp - lastCheckIn : 0;
        uint256 percent = inactivePeriod == 0 ? 0 : (elapsed * 100) / inactivePeriod;
        if (percent > 100) percent = 100;

        string memory base = string.concat(
            "On-chain checkIn inactivity: ",
            _uintToString(percent),
            " percent of threshold elapsed."
        );

        if (bytes(extraSignals).length > 0) {
            return string.concat(base, " Off-chain signals: ", extraSignals, ". Classify the inheritance risk.");
        }
        return string.concat(base, " Classify the inheritance risk.");
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
