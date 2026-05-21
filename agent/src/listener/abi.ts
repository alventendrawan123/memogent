export const MEMOGENT_AGENT_EVENTS = [
  'event AssessmentRequested(uint256 indexed requestId, address indexed user, uint256 deposit)',
  'event AssessmentReceived(uint256 indexed requestId, address indexed user, string classification)',
  'event RiskDecision(address indexed user, string classification, uint256 timestamp)',
  'event ExecutionTriggered(address indexed user)',
  'event AssessmentFailed(uint256 indexed requestId, address indexed user, uint8 status)',
] as const;

export const MEMOGENT_CORE_EVENTS = [
  'event WillRegistered(address indexed owner, address indexed beneficiary, uint256 deadlineMs)',
  'event CheckedIn(address indexed owner, uint256 newDeadlineMs)',
  'event WillExecuted(address indexed owner, address indexed beneficiary, uint256 executedAt)',
  'event AgentAuthoritySet(address indexed agent)',
] as const;
