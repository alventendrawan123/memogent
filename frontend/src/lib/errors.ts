import { BaseError } from "viem";

export function friendlyTxError(error: unknown): string | null {
  if (!error) return null;

  if (error instanceof BaseError) {
    if (error.walk((e) => (e as Error).name === "UserRejectedRequestError")) {
      return "Transaction cancelled in your wallet.";
    }
    if (error.walk((e) => (e as Error).name === "InsufficientFundsError")) {
      return "Not enough STT for gas. Grab some from the testnet faucet.";
    }
    const reverted = error.walk(
      (e) => (e as Error).name === "ContractFunctionRevertedError",
    );
    if (reverted) {
      const data = (reverted as { data?: { errorName?: string } }).data;
      const reason = (reverted as { reason?: string }).reason;
      if (reason) return reason;
      if (data?.errorName) return data.errorName;
    }
    return error.shortMessage || "Something went wrong. Please try again.";
  }

  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}
