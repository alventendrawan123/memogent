export const timeCapsuleAbi = [
  {
    type: "function",
    name: "attachCapsule",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cid", type: "string" },
      { name: "contentHash", type: "bytes32" },
      { name: "encryptionKey", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "removeCapsule",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "getCapsule",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [
      { name: "cid", type: "string" },
      { name: "contentHash", type: "bytes32" },
      { name: "attachedAt", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getDecryptionKey",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "bytes" }],
  },
  {
    type: "function",
    name: "isReleased",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "hasCapsule",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "CapsuleAttached",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "beneficiary", type: "address", indexed: true },
      { name: "cid", type: "string", indexed: false },
      { name: "contentHash", type: "bytes32", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "CapsuleRemoved",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "cid", type: "string", indexed: false },
    ],
    anonymous: false,
  },
] as const;
