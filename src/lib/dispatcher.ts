import { evaluateCapability } from "@/lib/capability";
import type { MockLedgerEntry, MockRefundRequest } from "@/lib/mock-ledger";
import { isCents } from "@/lib/money";

/**
 * The server-owned dispatcher.
 *
 * A model's proposed tool call is data, never an invocation. Nothing in this
 * codebase hands a model a callable tool. The proposal is parsed, validated and
 * brought here; this module decides whether the one permitted mock action may
 * run, and every refusal is returned as a recordable outcome.
 */

export type DispatchAuthorization =
  | "ALLOW"
  | "ROUTE_TO_HUMAN"
  | "BLOCKED_BY_POLICY_GUARD"
  | "QUARANTINE_AND_ROLLBACK";

export type DispatchStatus =
  | "MOCK_COMMITTED"
  | "DENIED_CAPABILITY"
  | "DENIED_INVALID_TOOL_NAME"
  | "GLOBAL_HALT"
  | "NOT_AUTHORIZED"
  | "INVALID_TOOL_ARGS";

export type DispatchResult = {
  status: DispatchStatus;
  attemptedTool: string;
  allowed: boolean;
  reason: string;
  deniedCapabilities: string[];
  mockLedger: MockLedgerEntry | null;
};

export type MockRefundRunner = (request: MockRefundRequest) => Promise<MockLedgerEntry>;

export type DispatchInput = {
  tool: string;
  args: Record<string, unknown>;
  authorization: DispatchAuthorization;
  ticketId: string;
  workpaperId: string;
};

function refused(
  status: DispatchStatus,
  attemptedTool: string,
  reason: string,
  deniedCapabilities: string[],
): DispatchResult {
  return { status, attemptedTool, allowed: false, reason, deniedCapabilities, mockLedger: null };
}

export async function dispatchToolCall(
  input: DispatchInput,
  runner: MockRefundRunner,
): Promise<DispatchResult> {
  // 1. Capability gate: is this tool on the runtime allowlist at all?
  const capability = evaluateCapability(input.tool);
  if (!capability.allowed) {
    const status: DispatchStatus =
      capability.reason === "GLOBAL_HALT"
        ? "GLOBAL_HALT"
        : capability.reason === "DENIED_INVALID_TOOL_NAME"
          ? "DENIED_INVALID_TOOL_NAME"
          : "DENIED_CAPABILITY";
    return refused(status, capability.attemptedTool, capability.reason, capability.deniedCapabilities);
  }

  // 2. Authorization gate: did SAAF actually allow this action?
  if (input.authorization !== "ALLOW") {
    return refused(
      "NOT_AUTHORIZED",
      capability.attemptedTool,
      `SAAF verdict was ${input.authorization}; no action dispatched.`,
      [],
    );
  }

  // 3. Argument gate: only integer cents, only EUR. Server owns ticket identity.
  const args = input.args ?? {};
  const amountCents = args.amountCents;
  const currency = args.currency;
  if (!isCents(amountCents) || amountCents === 0 || currency !== "EUR") {
    return refused(
      "INVALID_TOOL_ARGS",
      capability.attemptedTool,
      "execute_refund requires integer amountCents > 0 and currency EUR.",
      [],
    );
  }

  // 4. The one permitted mock action.
  const entry = await runner({
    ticketId: input.ticketId,
    workpaperId: input.workpaperId,
    amountCents,
    currency: "EUR",
  });

  return {
    status: "MOCK_COMMITTED",
    attemptedTool: capability.attemptedTool,
    allowed: true,
    reason: "DISPATCHED_TO_MOCK_LEDGER",
    deniedCapabilities: [],
    mockLedger: entry,
  };
}
