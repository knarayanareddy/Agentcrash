import { hashJson, sha256, stepPayloadHash } from "@/lib/hash";
import { genesisPolicyHash, genesisPromptHash } from "@/lib/policy";
import { evaluateActionGuard, type ActionGuardInput } from "@/lib/sentinel";
import {
  DEMO_POLICY,
  DEMO_RULE_IDS,
  demoPolicyCanonicalHash,
  demoPolicyProvenance,
} from "@/lib/demo-policy";
import { evaluatePolicyGuard, validatePolicyGuardInput, type PolicyGuardInput } from "@/lib/policy-guard";
import { TOOL_ALLOWLIST, UNSPECIFIED_TOOL } from "@/lib/capability";
import { getTicketFixture } from "@/lib/ticket-fixtures";
import {
  APPROVAL_TEMPLATE_IDS,
  RESPONSE_TEMPLATE_IDS,
  approvedCustomerResponse,
  type ResponseTemplateId,
} from "@/lib/response-templates";

/** Policy provenance stamped on a decision: which policy, which version, which bytes. */
export type PolicyProvenance = {
  policyId: string;
  version: string;
  effectiveDate: string;
  canonicalHash: string;
};

/** What the model proposed. Retained as evidence; never executed on its word. */
export type ProposalRecord = {
  provider: string;
  model: string;
  proposedAmountCents: number;
  proposedTool: string;
  citedEvidenceRefs: string[];
  claimedClaimType: string;
  claimedReviewThreat: boolean;
  proposedReplyHash: string;
  latencyMs: number;
  validationOk: boolean;
};

export type PolicyGuardRecord = {
  disposition: "PASS" | "REVIEW" | "BLOCK";
  reason: string;
  /** Exact inputs, kept so the offline verifier can re-perform the decision. */
  inputs: PolicyGuardInput;
  findings: { ruleId: string; disposition: "BLOCK" | "REVIEW"; detail: string }[];
};

export type CapabilityRecord = {
  attemptedTool: string;
  allowed: boolean;
  reason: string;
  deniedCapabilities: string[];
};

export type MockLedgerRecord = {
  entryId: string;
  amountCents: number;
  currency: string;
  status: string;
  externalPaymentExecuted: boolean;
  entryHash: string;
} | null;

export type CustomerResponseRecord = {
  templateId: string;
  policyClauseIds: string[];
};

export type CheckpointRecord = {
  restored: boolean;
  checkpointId: string | null;
  promptHash: string | null;
};

export type TraceEvent = {
  step: number;
  ticketId: number;
  customerInputHash: string;
  workingPromptHash: string;
  driftScore: number;
  toolCalled: string;
  toolArgs: { amount: number; currency: string };
  guardEvaluation: "PASSED" | "BLOCKED_BY_ACTION_GUARD";
  verdict: string;
  rollbackExecuted: boolean;
  restoredCheckpointHash: string | null;
  stepHash: string;
  parentHash: string | null;
  againstPolicy: boolean;
  paidAmount: number;
  policyInputs?: Omit<ActionGuardInput, "amount">;

  // --- Ticket Lab fields. Present on the model-proposal path only. ---
  /** Trusted fixture id, e.g. TKT-4401. Lets the verifier replay evidence checks. */
  ticketRef?: string;
  customerMessageHash?: string;
  policy?: PolicyProvenance;
  modelProposal?: ProposalRecord;
  policyGuard?: PolicyGuardRecord;
  capability?: CapabilityRecord;
  mockLedger?: MockLedgerRecord;
  customerResponse?: CustomerResponseRecord;
  reviewDecision?: string;
  checkpoint?: CheckpointRecord;
  /** Simulated only. Never described as money saved. */
  simulatedExposureCents?: number;
};

export type Workpaper = {
  workpaperId: string;
  auditStandard: string;
  metadata: {
    entity: string;
    system: string;
    timestamp: string;
    mode: string;
  };
  genesis: {
    policyHash: string;
    promptHash: string;
    hardRules: { max_amount: number; require_evidence: boolean };
  };
  /** Present on Ticket Lab workpapers: which synthetic policy governed them. */
  demoPolicy?: ReturnType<typeof demoPolicyProvenance>;
  trace: TraceEvent[];
  merkleRoot: string;
  auditSeal: "CONSISTENCY_CHECKED";
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isTraceEvent(value: unknown): value is TraceEvent {
  if (!isRecord(value) || !isRecord(value.toolArgs)) return false;
  const legacyShapeOk =
    Number.isInteger(value.step) &&
    Number.isInteger(value.ticketId) &&
    isHash(value.customerInputHash) &&
    isHash(value.workingPromptHash) &&
    isFiniteNumber(value.driftScore) &&
    typeof value.toolCalled === "string" && value.toolCalled.length > 0 &&
    isFiniteNumber(value.toolArgs.amount) && value.toolArgs.amount >= 0 &&
    typeof value.toolArgs.currency === "string" && value.toolArgs.currency.length > 0 &&
    (value.guardEvaluation === "PASSED" || value.guardEvaluation === "BLOCKED_BY_ACTION_GUARD") &&
    typeof value.verdict === "string" && value.verdict.length > 0 &&
    typeof value.rollbackExecuted === "boolean" &&
    (value.restoredCheckpointHash === null || (typeof value.restoredCheckpointHash === "string" && value.restoredCheckpointHash.length > 0)) &&
    isHash(value.stepHash) &&
    (value.parentHash === null || isHash(value.parentHash)) &&
    typeof value.againstPolicy === "boolean" &&
    isFiniteNumber(value.paidAmount) && value.paidAmount >= 0;
  if (!legacyShapeOk) return false;

  // Ticket Lab fields are optional, but when present they must be well formed —
  // a half-present safety field is exactly the kind of thing a verifier should
  // refuse rather than silently ignore.
  if (value.ticketRef !== undefined && (typeof value.ticketRef !== "string" || value.ticketRef.length === 0)) return false;
  if (value.customerMessageHash !== undefined && !isHash(value.customerMessageHash)) return false;
  if (value.policy !== undefined && !isPolicyProvenance(value.policy)) return false;
  if (value.modelProposal !== undefined && !isProposalRecord(value.modelProposal)) return false;
  if (value.policyGuard !== undefined && !isPolicyGuardRecord(value.policyGuard)) return false;
  if (value.capability !== undefined && !isCapabilityRecord(value.capability)) return false;
  if (value.mockLedger !== undefined && !isMockLedgerRecord(value.mockLedger)) return false;
  if (value.customerResponse !== undefined && !isCustomerResponseRecord(value.customerResponse)) return false;
  if (value.reviewDecision !== undefined && typeof value.reviewDecision !== "string") return false;
  if (value.checkpoint !== undefined && !isCheckpointRecord(value.checkpoint)) return false;
  if (value.simulatedExposureCents !== undefined && !isFiniteNumber(value.simulatedExposureCents)) return false;
  return true;
}

function isStringArray(value: unknown, max: number): boolean {
  return Array.isArray(value) && value.length <= max && value.every((item) => typeof item === "string");
}

function isPolicyProvenance(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.policyId === "string" && value.policyId.length > 0 &&
    typeof value.version === "string" && value.version.length > 0 &&
    typeof value.effectiveDate === "string" && value.effectiveDate.length > 0 &&
    isHash(value.canonicalHash)
  );
}

function isProposalRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.provider === "string" && value.provider.length > 0 &&
    typeof value.model === "string" && value.model.length > 0 &&
    isNonNegativeInt(value.proposedAmountCents) &&
    typeof value.proposedTool === "string" && value.proposedTool.length > 0 &&
    isStringArray(value.citedEvidenceRefs, 20) &&
    typeof value.claimedClaimType === "string" &&
    typeof value.claimedReviewThreat === "boolean" &&
    isHash(value.proposedReplyHash) &&
    isFiniteNumber(value.latencyMs) && value.latencyMs >= 0 &&
    typeof value.validationOk === "boolean"
  );
}

function isPolicyGuardRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.disposition !== "PASS" && value.disposition !== "REVIEW" && value.disposition !== "BLOCK") return false;
  if (typeof value.reason !== "string" || value.reason.length === 0) return false;
  if (!validatePolicyGuardInput(value.inputs)) return false;
  if (!Array.isArray(value.findings)) return false;
  return value.findings.every(
    (finding) =>
      isRecord(finding) &&
      typeof finding.ruleId === "string" && finding.ruleId.length > 0 &&
      (finding.disposition === "BLOCK" || finding.disposition === "REVIEW") &&
      typeof finding.detail === "string",
  );
}

function isCapabilityRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.attemptedTool === "string" && value.attemptedTool.length > 0 &&
    typeof value.allowed === "boolean" &&
    typeof value.reason === "string" && value.reason.length > 0 &&
    isStringArray(value.deniedCapabilities, 50)
  );
}

function isMockLedgerRecord(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return (
    typeof value.entryId === "string" && value.entryId.length > 0 &&
    isNonNegativeInt(value.amountCents) &&
    typeof value.currency === "string" && value.currency.length > 0 &&
    typeof value.status === "string" && value.status.length > 0 &&
    typeof value.externalPaymentExecuted === "boolean" &&
    isHash(value.entryHash)
  );
}

function isCustomerResponseRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.templateId === "string" && value.templateId.length > 0 && isStringArray(value.policyClauseIds, 20);
}

function isCheckpointRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.restored === "boolean" &&
    (value.checkpointId === null || typeof value.checkpointId === "string") &&
    (value.promptHash === null || isHash(value.promptHash))
  );
}

function hasBoundDemoMode(workpaperId: string, mode: unknown): boolean {
  if (mode !== "watchdog_on" && mode !== "watchdog_off") return false;
  const expected = workpaperId.includes("-OFF-")
    ? "watchdog_off"
    : workpaperId.includes("-ON-")
      ? "watchdog_on"
      : null;
  return mode === expected;
}

export function merkleRootFromLeaves(leaves: string[]): string {
  if (leaves.length === 0) return sha256("");
  let layer = [...leaves];
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = layer[i + 1] ?? layer[i];
      next.push(sha256(left + right));
    }
    layer = next;
  }
  return layer[0];
}

export function merkleLayers(leaves: string[]): string[][] {
  if (leaves.length === 0) return [[]];
  const layers: string[][] = [leaves];
  let layer = [...leaves];
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = layer[i + 1] ?? layer[i];
      next.push(sha256(left + right));
    }
    layers.push(next);
    layer = next;
  }
  return layers;
}

/**
 * Hash every event field except its own stepHash. This is a consistency hash,
 * not a signature or an authenticity proof.
 */
export function computeTraceHash(event: Omit<TraceEvent, "stepHash">): string {
  return stepPayloadHash(event);
}

/**
 * Binds the untrusted customer message into the event.
 *
 * The verifier has no copy of the message — that is the point of hashing it —
 * so this derivation is what makes the hash checkable offline: every input is
 * itself recorded in the event, and recomputing it proves the recorded message
 * hash belongs to this ticket, this provider and this proposal.
 */
export function ticketLabCustomerInputHash(input: {
  ticketRef: string;
  customerMessageHash: string;
  provider: string;
  proposedAmountCents: number;
  proposedTool: string;
}): string {
  return hashJson({
    ticketId: input.ticketRef,
    customerMessageHash: input.customerMessageHash,
    provider: input.provider,
    proposedAmountCents: input.proposedAmountCents,
    proposedTool: input.proposedTool,
  });
}

/**
 * Re-performs a Ticket Lab event from its recorded inputs.
 *
 * This is the part that makes the workpaper more than a hash manifest: the
 * policy guard is actually re-run, the recorded trusted facts are checked
 * against the fixture the ticket names, the capability decision is re-checked
 * against the runtime allowlist, and the side effect is required to be
 * consistent with every gate that had to pass for it to exist.
 */
function replayTicketLabEvent(event: TraceEvent): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const at = (text: string) => issues.push(`step ${event.step}: ${text}`);

  const guard = event.policyGuard!;
  const proposal = event.modelProposal;
  const policy = event.policy;
  const capability = event.capability;
  const ledger = event.mockLedger;
  const response = event.customerResponse;
  const checkpoint = event.checkpoint;

  // The Ticket Lab path must carry its full evidence set, or it is not auditable.
  if (!proposal) at("missing modelProposal");
  if (!policy) at("missing policy provenance");
  if (!capability) at("missing capability decision");
  if (!response) at("missing customerResponse");
  if (event.customerMessageHash === undefined) at("missing customerMessageHash");
  if (event.ticketRef === undefined) at("missing ticketRef");
  if (!proposal || !policy || !capability || !response) return { ok: false, issues };

  // 0. The recorded message hash must be the one this event was derived from.
  if (event.customerMessageHash !== undefined && event.ticketRef !== undefined) {
    const derived = ticketLabCustomerInputHash({
      ticketRef: event.ticketRef,
      customerMessageHash: event.customerMessageHash,
      provider: proposal.provider,
      proposedAmountCents: proposal.proposedAmountCents,
      proposedTool: proposal.proposedTool,
    });
    if (derived !== event.customerInputHash) {
      at("customerInputHash does not bind the recorded message hash, provider and proposal");
    }
  }

  // 1. Policy provenance must match the live synthetic policy, not a lookalike.
  if (policy.policyId !== DEMO_POLICY.policyId) at(`policy id ${policy.policyId} is not the live policy`);
  if (policy.version !== DEMO_POLICY.version) at(`policy version ${policy.version} is not the live version`);
  if (policy.effectiveDate !== DEMO_POLICY.effectiveDate) at("policy effective date is not the live date");
  if (policy.canonicalHash !== demoPolicyCanonicalHash()) at("policy canonical hash does not match the live policy bytes");

  // 2. Re-run the guard from its recorded inputs and compare the outcome.
  const replay = evaluatePolicyGuard(guard.inputs);
  if (replay.disposition !== guard.disposition) {
    at(`guard disposition ${guard.disposition} does not re-perform (replay: ${replay.disposition})`);
  }
  const recordedIds = guard.findings.map((f) => f.ruleId).sort().join(",");
  const replayIds = replay.findings.map((f) => f.ruleId).sort().join(",");
  if (recordedIds !== replayIds) at(`guard findings [${recordedIds}] do not re-perform (replay: [${replayIds}])`);
  for (const finding of guard.findings) {
    if (finding.ruleId !== "INVALID_POLICY_INPUT" && !DEMO_RULE_IDS.includes(finding.ruleId)) {
      at(`unknown rule id ${finding.ruleId}`);
    }
  }

  // 3. The "trusted" inputs must actually agree with the trusted fixture.
  const fixture = getTicketFixture(event.ticketRef);
  if (!fixture) {
    at(`ticketRef ${String(event.ticketRef)} is not a known fixture`);
  } else {
    if (guard.inputs.orderTotalCents !== fixture.orderTotalCents) at("recorded order total does not match the trusted fixture");
    if (guard.inputs.claimType !== fixture.claimType) at("recorded claim type does not match the trusted fixture");
    if (guard.inputs.reviewThreatOnTicket !== fixture.reviewThreatOnTicket) at("recorded threat flag does not match the trusted fixture");
    const verified = fixture.evidenceRefs.filter((r) => r.status === "verified").map((r) => r.refId).sort().join(",");
    if (guard.inputs.verifiedEvidenceRefs.slice().sort().join(",") !== verified) at("recorded verified evidence does not match the trusted fixture");
    const all = fixture.evidenceRefs.map((r) => r.refId).sort().join(",");
    if (guard.inputs.allEvidenceRefs.slice().sort().join(",") !== all) at("recorded evidence refs do not match the trusted fixture");
  }

  // The proposal that was judged must be the proposal that was recorded. A
  // fabricated evidence reference is legitimate *content* — the guard is
  // supposed to catch and record it under R6 — so it is not a verification
  // failure on its own. What is a failure is a proposal record that disagrees
  // with the inputs the guard was actually run against, because that is how a
  // fabricated citation would be laundered into a clean decision.
  if (proposal.citedEvidenceRefs.slice().sort().join(",") !== guard.inputs.citedEvidenceRefs.slice().sort().join(",")) {
    at("recorded model proposal does not match the evidence refs the guard was run against");
  }
  if (proposal.proposedAmountCents !== guard.inputs.proposedAmountCents && proposal.validationOk) {
    at("recorded proposed amount does not match the amount the guard was run against");
  }

  // 4. Capability: only an allowlisted tool may ever reach a side effect.
  const onAllowlist = (TOOL_ALLOWLIST as readonly string[]).includes(capability.attemptedTool);
  if (!onAllowlist && capability.allowed) at(`capability allowed a tool that is not on the allowlist: ${capability.attemptedTool}`);
  if (!onAllowlist && ledger) at("mock ledger entry recorded for a denied capability");

  // The tool chain must hold on denial as well as on approval. Binding these
  // only when the call was allowed left the security-critical path — a refused
  // tool — completely unbound, so a record could name a benign tool while the
  // model had asked for a destructive one.
  if (capability.attemptedTool !== event.toolCalled) {
    at(`capability decision (${capability.attemptedTool}) does not match the recorded tool call (${event.toolCalled})`);
  }
  const expectedDispatched = proposal.proposedTool || UNSPECIFIED_TOOL;
  if (expectedDispatched !== event.toolCalled) {
    at(`recorded tool call (${event.toolCalled}) is not the tool the model proposed (${proposal.proposedTool || "<empty>"})`);
  }

  // 5. A side effect requires every gate to have been green.
  if (ledger) {
    if (ledger.externalPaymentExecuted !== false) at("external payment recorded as executed; this system never executes external payments");
    if (ledger.status !== "MOCK_COMMITTED") at(`unexpected mock ledger status ${ledger.status}`);
    if (ledger.currency !== "EUR") at(`unexpected mock ledger currency ${ledger.currency}`);
    if (event.verdict !== "ALLOW") at("mock ledger entry recorded without an ALLOW verdict");
    if (guard.disposition !== "PASS") at("mock ledger entry recorded despite a non-PASS guard disposition");
    if (!proposal.validationOk) at("mock ledger entry recorded for an invalid model proposal");
    if (!capability.allowed) at("mock ledger entry recorded without capability authorization");
    if (ledger.amountCents !== proposal.proposedAmountCents) at("committed amount differs from the proposed amount");
    if (ledger.amountCents > guard.inputs.orderTotalCents) at("committed amount exceeds the order total");
    if (Math.abs(event.paidAmount - ledger.amountCents / 100) > 1e-9) at("paidAmount does not match the committed mock amount");
  } else if (event.paidAmount !== 0) {
    at("paidAmount is non-zero with no mock ledger entry");
  }

  // 6. The customer response must be an approved template bound to the outcome.
  if (!RESPONSE_TEMPLATE_IDS.includes(response.templateId as ResponseTemplateId)) {
    at(`customer response template ${response.templateId} is not an approved template`);
  }
  const isApproval = APPROVAL_TEMPLATE_IDS.includes(response.templateId as ResponseTemplateId);
  if (isApproval && event.verdict !== "ALLOW") at("approval template used without an ALLOW verdict");
  if (!isApproval && event.verdict === "ALLOW") at("ALLOW verdict did not use an approval template");
  for (const clause of response.policyClauseIds) {
    if (!DEMO_RULE_IDS.includes(clause)) at(`customer response cites unknown clause ${clause}`);
  }

  // Checking the fields individually left the template swappable:
  // BLOCKED_FABRICATED_EVIDENCE -> BLOCKED_ABOVE_ORDER_TOTAL passes, because
  // both are known templates, neither is an approval template, and R1 is a real
  // rule id. So re-perform the response, exactly as the guard is re-performed,
  // and require the template, clauses and text to match this outcome.
  // The workpaper record stores the template id and clauses only, not the
  // rendered text. Deriving the rule lists from the recorded findings is
  // exactly how evaluatePolicyGuard computes them (policy-guard.ts:155-156),
  // so this reproduces the same call the producer made.
  const expectedResponse = approvedCustomerResponse({
    verdict: event.verdict,
    blockingRuleIds: guard.findings.filter((f) => f.disposition === "BLOCK").map((f) => f.ruleId),
    reviewRuleIds: guard.findings.filter((f) => f.disposition === "REVIEW").map((f) => f.ruleId),
    approvedAmountCents: ledger ? ledger.amountCents : null,
    ticketId: String(event.ticketRef ?? ""),
  });
  if (expectedResponse.templateId !== response.templateId) {
    at(`customer response template ${response.templateId} is not the template this outcome produces (expected ${expectedResponse.templateId})`);
  }
  if (expectedResponse.policyClauseIds.join(",") !== response.policyClauseIds.join(",")) {
    at(`customer response clauses [${response.policyClauseIds.join(", ")}] do not match this outcome (expected [${expectedResponse.policyClauseIds.join(", ")}])`);
  }

  // 7. The checkpoint record must agree with the rollback actually performed.
  if (checkpoint) {
    if (checkpoint.restored !== event.rollbackExecuted) at("checkpoint record disagrees with rollbackExecuted");
    if (checkpoint.restored && (!checkpoint.checkpointId || !checkpoint.promptHash)) at("restored checkpoint missing id or prompt hash");
    if (checkpoint.restored && event.restoredCheckpointHash !== checkpoint.promptHash) at("restored checkpoint hash does not match the event hash");
  }

  return { ok: issues.length === 0, issues };
}

export type VerifyResult = {
  ok: boolean;
  formatMatch: boolean;
  genesisMatch: boolean;
  guardReplayMatch: boolean;
  hashChainMatch: boolean;
  merkleMatch: boolean;
  failedSteps: number[];
  /** Human-readable replay failures. Empty when verification passes. */
  replayIssues: string[];
  computedMerkleRoot: string;
  expectedMerkleRoot: string;
  message: string;
};

function invalidResult(message: string, expectedMerkleRoot = ""): VerifyResult {
  return {
    ok: false,
    formatMatch: false,
    genesisMatch: false,
    guardReplayMatch: false,
    hashChainMatch: false,
    merkleMatch: false,
    failedSteps: [],
    replayIssues: [],
    computedMerkleRoot: merkleRootFromLeaves([]),
    expectedMerkleRoot,
    message,
  };
}

export function verifyWorkpaper(value: unknown): VerifyResult {
  if (!isRecord(value)) return invalidResult("Verification failed: malformed workpaper.");

  const merkleRoot = typeof value.merkleRoot === "string" ? value.merkleRoot : "";
  if (
    typeof value.workpaperId !== "string" ||
    !isRecord(value.metadata) ||
    !isRecord(value.genesis) ||
    !Array.isArray(value.trace) ||
    value.trace.length === 0 ||
    value.auditSeal !== "CONSISTENCY_CHECKED"
  ) {
    return invalidResult("Verification failed: malformed or empty workpaper.", merkleRoot);
  }

  const metadata = value.metadata;
  const genesis = value.genesis;
  const formatMatch = hasBoundDemoMode(value.workpaperId, metadata.mode) &&
    isHash(merkleRoot) &&
    isHash(genesis.policyHash) &&
    isHash(genesis.promptHash) &&
    isRecord(genesis.hardRules) &&
    isFiniteNumber(genesis.hardRules.max_amount) &&
    typeof genesis.hardRules.require_evidence === "boolean" &&
    value.trace.every(isTraceEvent);

  if (!formatMatch) return invalidResult("Verification failed: malformed workpaper fields.", merkleRoot);

  const typed = value as Workpaper;
  const policyBytesHash = hashJson(typed.genesis.hardRules);
  const genesisMatch =
    policyBytesHash === typed.genesis.policyHash &&
    typed.genesis.policyHash === genesisPolicyHash() &&
    typed.genesis.promptHash === genesisPromptHash();

  const runningHashes: string[] = [];
  const failedSteps: number[] = [];
  const replayIssues: string[] = [];
  let guardReplayMatch = true;
  let hashChainMatch = true;
  let expectedParentHash: string | null = genesisPromptHash();

  for (const event of typed.trace) {
    if (event.parentHash !== expectedParentHash) {
      hashChainMatch = false;
      failedSteps.push(event.step);
    }

    // Preserve forward-compatible event fields: only the hash is excluded.
    const { stepHash: _stepHash, ...eventPayload } = event;
    const computed = computeTraceHash(eventPayload);
    runningHashes.push(computed);
    if (computed !== event.stepHash) {
      hashChainMatch = false;
      failedSteps.push(event.step);
    }

    const overHardCap = event.toolArgs.amount > typed.genesis.hardRules.max_amount;
    // Two event generations, each re-performed against its own rules. The Ticket
    // Lab path is replayed by replayTicketLabEvent below; the legacy rehearsal
    // and live-interceptor path keeps its original re-performance here.
    const isLabEvent = event.policyGuard !== undefined;
    if (!isLabEvent) {
      if (event.policyInputs !== undefined || typed.workpaperId.startsWith("WP-LIVE-")) {
        const replay = evaluateActionGuard({ ...event.policyInputs, amount: event.toolArgs.amount } as ActionGuardInput);
        if (replay.reason === "INVALID_ACTION_INPUT" || replay.evaluation !== event.guardEvaluation ||
            (typed.metadata.mode === "watchdog_on" && !replay.ok && event.paidAmount !== 0)) {
          guardReplayMatch = false;
          failedSteps.push(event.step);
        }
      }
      if (overHardCap && event.guardEvaluation !== "BLOCKED_BY_ACTION_GUARD") {
        guardReplayMatch = false;
        failedSteps.push(event.step);
      }
      if (typed.metadata.mode === "watchdog_on" && overHardCap && event.paidAmount !== 0) {
        guardReplayMatch = false;
        failedSteps.push(event.step);
      }
    }
    if (event.paidAmount > event.toolArgs.amount) {
      guardReplayMatch = false;
      failedSteps.push(event.step);
    }
    if (
      (event.rollbackExecuted && event.restoredCheckpointHash === null) ||
      (!event.rollbackExecuted && event.restoredCheckpointHash !== null) ||
      (event.verdict === "QUARANTINE_AND_ROLLBACK" && !event.rollbackExecuted)
    ) {
      guardReplayMatch = false;
      failedSteps.push(event.step);
    }

    if (isLabEvent) {
      const lab = replayTicketLabEvent(event);
      if (!lab.ok) {
        guardReplayMatch = false;
        failedSteps.push(event.step);
        replayIssues.push(...lab.issues);
      }
    }

    expectedParentHash = event.stepHash;
  }

  const computedMerkleRoot = merkleRootFromLeaves(runningHashes);
  const merkleMatch = computedMerkleRoot === typed.merkleRoot;
  const ok = genesisMatch && guardReplayMatch && hashChainMatch && merkleMatch;

  return {
    ok,
    formatMatch,
    genesisMatch,
    guardReplayMatch,
    hashChainMatch,
    merkleMatch,
    failedSteps: Array.from(new Set(failedSteps)),
    replayIssues,
    computedMerkleRoot,
    expectedMerkleRoot: typed.merkleRoot,
    message: ok
      ? "Deterministic consistency and re-performance checks passed; hashes are not signatures or proof of authenticity."
      : replayIssues.length > 0
        ? `Verification failed. ${replayIssues.length} re-performance check(s) did not reproduce: ${replayIssues[0]}`
        : "Verification failed. Workpaper does not re-perform cleanly.",
  };
}

export function buildWorkpaper(input: {
  workpaperId: string;
  mode: string;
  promptHash: string;
  trace: TraceEvent[];
  entity?: string;
  system?: string;
  /** Stamp the synthetic demo policy provenance onto a Ticket Lab workpaper. */
  withDemoPolicy?: boolean;
}): Workpaper {
  const merkle = merkleRootFromLeaves(input.trace.map((t) => t.stepHash));
  return {
    workpaperId: input.workpaperId,
    auditStandard: "ISA_230 / NOREA_AI_CONTROL_FRAMEWORK",
    metadata: {
      entity: input.entity ?? "Just Eat Takeaway.com",
      system: input.system ?? "Automated Care Refunds Agent",
      timestamp: new Date().toISOString(),
      mode: input.mode,
    },
    genesis: {
      policyHash: genesisPolicyHash(),
      promptHash: input.promptHash,
      hardRules: { max_amount: 20.0, require_evidence: true },
    },
    ...(input.withDemoPolicy ? { demoPolicy: demoPolicyProvenance() } : {}),
    trace: input.trace,
    merkleRoot: merkle,
    auditSeal: "CONSISTENCY_CHECKED",
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderWorkpaperHtml(wp: Workpaper, verification: VerifyResult): string {
  const rows = wp.trace
    .map(
      (e) => `<tr>
        <td>${e.step}</td>
        <td>#${e.ticketId}</td>
        <td>€${e.toolArgs.amount.toFixed(2)}</td>
        <td>${e.guardEvaluation}</td>
        <td>${e.verdict}</td>
        <td>${e.driftScore.toFixed(2)}</td>
        <td><code>${e.stepHash.slice(0, 16)}</code></td>
      </tr>`,
    )
    .join("");

  const labBlocks = wp.trace
    .filter((e) => e.policyGuard !== undefined)
    .map((e) => {
      const guard = e.policyGuard!;
      const proposal = e.modelProposal!;
      const capability = e.capability!;
      const findings =
        guard.findings.length > 0
          ? `<ul>${guard.findings
              .map((f) => `<li><code>${escapeHtml(f.ruleId)}</code> [${f.disposition}] ${escapeHtml(f.detail)}</li>`)
              .join("")}</ul>`
          : "<p>No rule fired.</p>";
      return `<section>
        <h2>Step ${e.step} · ${escapeHtml(String(e.ticketRef ?? ""))} · Ticket Lab re-performance</h2>
        <p>Customer message hash: <code>${escapeHtml(String(e.customerMessageHash ?? ""))}</code></p>
        <p>Policy: <code>${escapeHtml(guard.inputs.claimType)}</code> claim · ${escapeHtml(
          wp.demoPolicy ? `${wp.demoPolicy.policyId} v${wp.demoPolicy.version}` : "unknown",
        )} · canonical <code>${escapeHtml(String(e.policy?.canonicalHash ?? ""))}</code></p>
        <p>Model proposal: ${escapeHtml(proposal.provider)} / ${escapeHtml(proposal.model)} · €${(
          proposal.proposedAmountCents / 100
        ).toFixed(2)} · tool <code>${escapeHtml(proposal.proposedTool)}</code> · ${proposal.latencyMs}ms · validation ${
          proposal.validationOk ? "ok" : "FAILED"
        }</p>
        <p>Guard disposition: <strong>${guard.disposition}</strong> (${escapeHtml(guard.reason)})</p>
        ${findings}
        <p>Capability: <code>${escapeHtml(capability.attemptedTool)}</code> → ${
          capability.allowed ? "ALLOWED" : `DENIED (${escapeHtml(capability.reason)})`
        }${
          capability.deniedCapabilities.length > 0
            ? ` · denied capabilities: ${capability.deniedCapabilities.map(escapeHtml).join(", ")}`
            : ""
        }</p>
        <p>Mock ledger: ${
          e.mockLedger
            ? `${escapeHtml(e.mockLedger.entryId)} · €${(e.mockLedger.amountCents / 100).toFixed(2)} · ${escapeHtml(
                e.mockLedger.status,
              )} · external payment executed: ${e.mockLedger.externalPaymentExecuted ? "YES" : "No"}`
            : "no entry (no side effect)"
        }</p>
        <p>Customer response: approved template <code>${escapeHtml(e.customerResponse?.templateId ?? "")}</code> · clauses ${escapeHtml(
          (e.customerResponse?.policyClauseIds ?? []).join(", "),
        )}</p>
        <p>Review decision: ${escapeHtml(String(e.reviewDecision ?? "n/a"))} · checkpoint restored: ${
          e.checkpoint?.restored ? "yes" : "no"
        }</p>
      </section>`;
    })
    .join("");

  const issues =
    verification.replayIssues.length > 0
      ? `<ul class="issues">${verification.replayIssues.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
      : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${wp.workpaperId}</title>
<style>
  body { font-family: ui-monospace, monospace; background: #07080c; color: #e8e4d9; padding: 32px; }
  h1 { color: #ff7a1a; }
  h2 { color: #3ee0c5; font-size: 14px; margin-top: 28px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { border: 1px solid #2a2e38; padding: 6px 8px; text-align: left; }
  section { border: 1px solid #2a2e38; border-radius: 8px; padding: 12px 16px; margin-top: 12px; font-size: 12px; }
  .ok { color: #4ade80; } .bad { color: #ff4d6d; }
  .issues { color: #ff4d6d; }
</style></head>
<body>
  <h1>SAAF-VERIFY · ${wp.workpaperId}</h1>
  <p>${wp.auditStandard}</p>
  <p>Entity: ${escapeHtml(wp.metadata.entity)} · System: ${escapeHtml(wp.metadata.system)}</p>
  <p>Genesis policy hash: <code>${wp.genesis.policyHash}</code></p>
  ${
    wp.demoPolicy
      ? `<p>Demo policy: <code>${escapeHtml(wp.demoPolicy.policyId)}</code> v${escapeHtml(
          wp.demoPolicy.version,
        )} · effective ${escapeHtml(wp.demoPolicy.effectiveDate)} · canonical <code>${escapeHtml(
          wp.demoPolicy.canonicalHash,
        )}</code></p><p><em>${escapeHtml(wp.demoPolicy.syntheticNotice)}</em></p>`
      : ""
  }
  <p>Merkle root: <code>${wp.merkleRoot}</code></p>
  <p class="${verification.ok ? "ok" : "bad"}">${escapeHtml(verification.message)}</p>
  ${issues}
  <table>
    <thead><tr><th>Step</th><th>Ticket</th><th>Amount</th><th>Guard</th><th>Verdict</th><th>Drift</th><th>Hash</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${labBlocks}
</body></html>`;
}
