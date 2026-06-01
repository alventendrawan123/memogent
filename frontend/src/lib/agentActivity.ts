import { type Address, parseAbiItem } from "viem";
import { getPublicClient } from "wagmi/actions";
import { CONTRACTS } from "./contracts";
import { findLatestLog } from "./somniaLogs";
import { wagmiConfig } from "./wagmi";

export const RISK_SYSTEM_PROMPT =
  "You are a risk classifier for an autonomous digital inheritance system. " +
  "Given the wallet inactivity signal and any extra signals provided, classify the risk into exactly one of: " +
  "SAFE (low risk, recent activity), " +
  "WATCH (mild inactivity, monitor closely), " +
  "GRACE (moderate inactivity, send warning to user), " +
  "EXECUTE (critical inactivity, trigger inheritance). " +
  "Weigh ALL signals together. Respond with exactly one word from the allowed values.";

export const EMPATHY_SYSTEM_PROMPT =
  "You are writing a brief final farewell in the voice of a person whose digital will just executed automatically. " +
  "The person has gone inactive for an extended period and the inheritance has transferred to their named beneficiary. " +
  "Write 2 to 4 short, warm, sincere sentences directly addressing the beneficiary. " +
  "Do not be melodramatic. Sound natural, like a hastily-written note. " +
  "Do not include placeholders, names, or addresses. Use 'I' and 'you'. Avoid cliches.";

const ASSESSMENT_RECEIVED_EVENT = parseAbiItem(
  "event AssessmentReceived(uint256 indexed requestId, address indexed user, string classification)",
);

const EMPATHY_GENERATED_EVENT = parseAbiItem(
  "event EmpathyMessageGenerated(address indexed user, string message)",
);

export type AgentLogInfo = {
  txHash: `0x${string}`;
  blockNumber: bigint;
};

export async function getLatestAssessmentLog(
  user: Address,
): Promise<AgentLogInfo | null> {
  const client = getPublicClient(wagmiConfig);
  if (!client) return null;
  try {
    const log = await findLatestLog(client, {
      address: CONTRACTS.memogentAgent,
      event: ASSESSMENT_RECEIVED_EVENT,
      args: { user },
    });
    if (!log?.transactionHash || log.blockNumber == null) return null;
    return { txHash: log.transactionHash, blockNumber: log.blockNumber };
  } catch {
    return null;
  }
}

export async function getEmpathyLog(
  user: Address,
): Promise<AgentLogInfo | null> {
  const client = getPublicClient(wagmiConfig);
  if (!client) return null;
  try {
    const log = await findLatestLog(client, {
      address: CONTRACTS.memogentAgent,
      event: EMPATHY_GENERATED_EVENT,
      args: { user },
    });
    if (!log?.transactionHash || log.blockNumber == null) return null;
    return { txHash: log.transactionHash, blockNumber: log.blockNumber };
  } catch {
    return null;
  }
}
