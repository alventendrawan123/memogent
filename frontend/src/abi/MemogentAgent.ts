export const memogentAgentAbi = [
  {
    type: "function",
    name: "latestAssessment",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "classification", type: "string" },
      { name: "assessedAt", type: "uint256" },
      { name: "requestId", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "empathyMessages",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "lastAssessmentRequestAt",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "assessRisk",
    stateMutability: "payable",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "assessRiskWithContext",
    stateMutability: "payable",
    inputs: [
      { name: "user", type: "address" },
      { name: "extraSignals", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "generateEmpathyMessage",
    stateMutability: "payable",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
  },
  {
    type: "event",
    name: "AssessmentRequested",
    inputs: [
      { name: "requestId", type: "uint256", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "deposit", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "AssessmentRequestedWithContext",
    inputs: [
      { name: "requestId", type: "uint256", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "contextSummary", type: "string", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "AssessmentReceived",
    inputs: [
      { name: "requestId", type: "uint256", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "classification", type: "string", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RiskDecision",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "classification", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "EmpathyMessageGenerated",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "message", type: "string", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ExecutionTriggered",
    inputs: [{ name: "user", type: "address", indexed: true }],
    anonymous: false,
  },
] as const;
