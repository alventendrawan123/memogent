export const MEMOGENT_AGENT_EVENTS = [
  'event AssessmentRequested(uint256 indexed requestId, address indexed user, uint256 deposit)',
  'event AssessmentReceived(uint256 indexed requestId, address indexed user, string classification)',
  'event RiskDecision(address indexed user, string classification, uint256 timestamp)',
  'event ExecutionTriggered(address indexed user)',
  'event AssessmentFailed(uint256 indexed requestId, address indexed user, uint8 status)',
  'event EmpathyMessageRequested(uint256 indexed requestId, address indexed user, uint256 deposit)',
  'event EmpathyMessageGenerated(address indexed user, string message)',
  'event EmpathyMessageFailed(uint256 indexed requestId, address indexed user, uint8 status)',
] as const;

export const MEMOGENT_CORE_EVENTS = [
  'event WillRegistered(address indexed owner, address indexed beneficiary, uint256 deadlineMs)',
  'event CheckedIn(address indexed owner, uint256 newDeadlineMs)',
  'event WillExecuted(address indexed owner, address indexed beneficiary, uint256 executedAt)',
  'event AgentAuthoritySet(address indexed agent)',
] as const;

export const TIME_CAPSULE_EVENTS = [
  'event CapsuleAttached(address indexed owner, address indexed beneficiary, string cid, bytes32 contentHash)',
  'event CapsuleUpdated(address indexed owner, string oldCid, string newCid)',
  'event CapsuleRemoved(address indexed owner, string cid)',
] as const;

export const TIME_CAPSULE_VIEW = [
  'function getCapsule(address owner) external view returns (string cid, bytes32 contentHash, uint256 attachedAt)',
  'function hasCapsule(address owner) external view returns (bool)',
  'function isReleased(address owner) external view returns (bool)',
] as const;
