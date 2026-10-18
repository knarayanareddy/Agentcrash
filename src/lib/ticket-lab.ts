import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { checkpoints, sentinelSessions, ticketEvents, workpapers } from "@/db/schema";
import { evaluateCapability } from "@/lib/capability";
import { DEMO_POLICY, demoPolicyCanonicalHash } from "@/lib/demo-policy";
import { dispatchToolCall } from "@/lib/dispatcher";
import { hashPrompt } from "@/lib/hash";
import { judgeWithJev } from "@/lib/jev";
import {
  buildWorkpaper,
  computeTraceHash,
  renderWorkpaperHtml,
  verifyWorkpaper,
  type CapabilityRecord,
  type CheckpointRecord,
  type CustomerResponseRecord,
  type MockLedgerRecord,
  type PolicyGuardRecord,
  type PolicyProvenance,
  type ProposalRecord,
  ticketLabCustomerInputHash,
  type TraceEvent,
} from "@/lib/ledger";
import { MAX_MESSAGE_CHARS, scanCustomerMessage } from "@/lib/message-signals";
import { commitMockRefund } from "@/lib/mock-ledger";
import { isCents } from "@/lib/money";
import { GENESIS_PROMPT, genesisPromptHash } from "@/lib/policy";
import { evaluatePolicyGuard, type PolicyGuardInput } from "@/lib/policy-guard";
import { proposeFromCustomerMessage, type ModelProposal } from "@/lib/proposal-model";
import { approvedCustomerResponse } from "@/lib/response-templates";
import { calculateDrift } from "@/lib/sentinel";
import { getTicketFixture, type TicketFixture } from "@/lib/ticket-fixtures";

/**
 * Ticket Lab: the ticket-to-action journey.
 *
 *   untrusted customer message
 *     → one model call producing a structured proposal (never an invocation)
 *     → deterministic policy guard over trusted server-side ticket facts
 *     → drift / instruction / memory audit and Jev judgment
 *     → runtime capability allowlist
 *     → server-owned dispatcher → mock ledger (the only side effect)
 *     → customer response rendered from an approved template
 *     → replayable workpaper, committed in one transaction
 */

export type TicketLabVerdict =
  | "ALLOW"
  | "ROUTE_TO_HUMAN"
  | "BLOCKED_BY_POLICY_GUARD"
  | "QUARANTINE_AND_ROLLBACK";

export type TicketLabInput = {
  ticketId: string;
  customerMessage: string;
  sessionId?: string;
  currentPrompt?: string;
  currentMemory?: string[];
};

export type TicketLabMetrics = {
  ticketsEvaluated: number;
  unsafeProposalsStopped: number;
  eligibleRefundsPreserved: number;
  humanReviewRoutes: number;
  checkpointRestores: number;
  modelProposedCents: number;
  mockCommittedCents: number;
  simulatedExposurePreventedCents: number;
  deniedCapabilities: string[];
  externalPaymentExecuted: false;
  jevStatus: string;
  jevModel: string | null;
  jevLatencyMs: number;
};

const UNSPECIFIED_TOOL = "UNSPECIFIED";

export function parseTicketLabInput(value: unknown): TicketLabInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;

  const ticketId = body.ticketId;
  if (typeof ticketId !== "string" || !getTicketFixture(ticketId)) return null;

  const customerMessage = body.customerMessage;
  if (typeof customerMessage !== "string" || customerMessage.length === 0 || customerMessage.length > MAX_MESSAGE_CHARS) {
    return null;
  }

  if (body.sessionId !== undefined && !isValidSessionId(body.sessionId)) return null;
  if (body.currentPrompt !== undefined && (typeof body.currentPrompt !== "string" || body.currentPrompt.length > 20000)) {
    return null;
  }
  if (
    body.currentMemory !== undefined &&
    (!Array.isArray(body.currentMemory) ||
      body.currentMemory.length > 100 ||
      !body.currentMemory.every((lesson) => typeof lesson === "string" && lesson.length <= 2000))
  ) {
    return null;
  }

  return {
    ticketId,
    customerMessage,
    ...(body.sessionId !== undefined ? { sessionId: body.sessionId as string } : {}),
    ...(body.currentPrompt !== undefined ? { currentPrompt: body.currentPrompt as string } : {}),
    ...(body.currentMemory !== undefined ? { currentMemory: body.currentMemory as string[] } : {}),
  };
}

export const isValidSessionId = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function guardInputsFrom(fixture: TicketFixture, proposal: ModelProposal, threatMarkers: string[]): PolicyGuardInput {
  // Every field here is server-derived. The model's claims arrive only as
  // proposedAmountCents and citedEvidenceRefs, both bounded and re-validated.
  const rawRefs = Array.isArray(proposal.citedEvidenceRefs) ? proposal.citedEvidenceRefs : [];
  return {
    orderTotalCents: fixture.orderTotalCents,
    claimType: fixture.claimType,
    verifiedEvidenceRefs: fixture.evidenceRefs.filter((ref) => ref.status === "verified").map((ref) => ref.refId),
    allEvidenceRefs: fixture.evidenceRefs.map((ref) => ref.refId),
    reviewThreatOnTicket: fixture.reviewThreatOnTicket,
    threatMarkers: threatMarkers.slice(0, 50),
    proposedAmountCents: isCents(proposal.proposedAmountCents) ? proposal.proposedAmountCents : 0,
    citedEvidenceRefs: rawRefs.filter((ref) => typeof ref === "string" && ref.length <= 200).slice(0, 50),
  };
}

export function computeLabMetrics(
  trace: TraceEvent[],
  jev: { status: string; model: string | null; latencyMs: number },
): TicketLabMetrics {
  const lab = trace.filter((event) => event.policyGuard !== undefined);
  const denied = new Set<string>();
  for (const event of lab) {
    for (const capability of event.capability?.deniedCapabilities ?? []) denied.add(capability);
  }
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  return {
    ticketsEvaluated: lab.length,
    unsafeProposalsStopped: lab.filter((event) => event.verdict === "BLOCKED_BY_POLICY_GUARD").length,
    eligibleRefundsPreserved: lab.filter((event) => event.verdict === "ALLOW" && event.mockLedger).length,
    humanReviewRoutes: lab.filter((event) => event.verdict === "ROUTE_TO_HUMAN").length,
    checkpointRestores: lab.filter((event) => event.rollbackExecuted).length,
    modelProposedCents: sum(lab.map((event) => event.modelProposal?.proposedAmountCents ?? 0)),
    mockCommittedCents: sum(lab.map((event) => event.mockLedger?.amountCents ?? 0)),
    simulatedExposurePreventedCents: sum(lab.map((event) => event.simulatedExposureCents ?? 0)),
    deniedCapabilities: Array.from(denied).sort(),
    externalPaymentExecuted: false,
    jevStatus: jev.status,
    jevModel: jev.model,
    jevLatencyMs: jev.latencyMs,
  };
}

/** Runs the full loop. Nothing here hands a model a callable tool. */
export async function processTicketLab(input: TicketLabInput) {
  const fixture = getTicketFixture(input.ticketId);
  if (!fixture) throw new Error("UNKNOWN_TICKET");
  const sessionId = input.sessionId ?? randomUUID();
  const workpaperId = `WP-LAB-ON-${sessionId}`;

  // 1. Model proposal, outside the transaction: it depends only on the fixture
  //    and the untrusted message, and it is the slowest step.
  const signals = scanCustomerMessage(input.customerMessage);
  const proposal = await proposeFromCustomerMessage(fixture, input.customerMessage);
  const attemptedTool = proposal.proposedTool || UNSPECIFIED_TOOL;

  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '10s'`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${sessionId}))`);

    const [stored] = await tx.select().from(sentinelSessions).where(eq(sentinelSessions.id, sessionId));
    const before = { prompt: stored?.activePrompt ?? GENESIS_PROMPT, memory: stored?.activeMemory ?? [] };
    const checkpoint = { prompt: stored?.checkpointPrompt ?? GENESIS_PROMPT, memory: stored?.checkpointMemory ?? [] };
    const proposedState = {
      prompt: input.currentPrompt ?? before.prompt,
      memory: input.currentMemory ?? before.memory,
    };
    const trace = (stored?.trace ?? []) as unknown as TraceEvent[];
    if (trace.length >= 1000) throw new Error("SESSION_EVENT_LIMIT");
    const step = trace.length + 1;

    // 2. Deterministic decision over trusted facts.
    const guardInputs = guardInputsFrom(fixture, proposal, signals.threatMarkers);
    const guard = evaluatePolicyGuard(guardInputs);
    const drift = calculateDrift(proposedState.prompt, proposedState.memory);

    const jev = await judgeWithJev({
      proposedAction: {
        ticketId: fixture.ticketId,
        proposedAmountCents: proposal.proposedAmountCents,
        proposedTool: attemptedTool,
        citedEvidenceRefs: proposal.citedEvidenceRefs,
        claimType: fixture.claimType,
        orderTotalCents: fixture.orderTotalCents,
      },
      proposalValidation: proposal.validation,
      customerMessageSignals: { threatMarkers: signals.threatMarkers, injectionMarkers: signals.injectionMarkers },
      instructions: proposedState.prompt,
      memory: proposedState.memory,
      deterministicAssessment: { disposition: guard.disposition, reason: guard.reason, drift },
    });

    const rollbackExecuted =
      drift.driftScore >= 0.5 || drift.weakenedRules.length > 0 || jev.choice === "quarantine";

    const jevUncertain =
      jev.status !== "succeeded" ||
      jev.confidence === null ||
      jev.confidence < 0.8 ||
      (jev.choice === "allow" && (jev.probabilities?.allow ?? 0) < 0.8);

    let verdict: TicketLabVerdict;
    let reason: string;
    if (rollbackExecuted) {
      verdict = "QUARANTINE_AND_ROLLBACK";
      reason = "PROPOSED_STATE_QUARANTINED_CHECKPOINT_RESTORED";
    } else if (guard.disposition === "BLOCK") {
      verdict = "BLOCKED_BY_POLICY_GUARD";
      reason = guard.reason;
    } else if (!proposal.validation.ok) {
      verdict = "ROUTE_TO_HUMAN";
      reason = "MODEL_PROPOSAL_INVALID";
    } else if (guard.disposition === "REVIEW") {
      verdict = "ROUTE_TO_HUMAN";
      reason = guard.reason;
    } else if (jevUncertain) {
      verdict = "ROUTE_TO_HUMAN";
      reason = jev.status !== "succeeded" ? jev.error! : "JEV_UNCERTAIN_HUMAN_REVIEW";
    } else if (jev.choice !== "allow") {
      verdict = "ROUTE_TO_HUMAN";
      reason = jev.choice === "human" ? "JEV_HUMAN_REVIEW" : "JEV_HUMAN_REVIEW";
    } else {
      verdict = "ALLOW";
      reason = guard.reason;
    }

    // 3. Capability allowlist, then the dispatcher decides about the side effect.
    const capability = evaluateCapability(attemptedTool);
    const dispatch = await dispatchToolCall(
      {
        tool: attemptedTool,
        args: { amountCents: guardInputs.proposedAmountCents, currency: "EUR" },
        authorization: verdict,
        ticketId: fixture.ticketId,
        workpaperId,
      },
      (request) => commitMockRefund(tx, request),
    );

    // ALLOW means "may be paid". If nothing could be paid, a human owns it.
    if (verdict === "ALLOW" && !dispatch.mockLedger) {
      verdict = "ROUTE_TO_HUMAN";
      reason = `DISPATCH_REFUSED_${dispatch.reason}`;
    }

    const action = rollbackExecuted ? "ROLLBACK" : verdict === "ALLOW" ? "PROCEED" : "HALT";
    const after = rollbackExecuted ? checkpoint : verdict === "ALLOW" ? proposedState : before;
    const healthy = verdict === "ALLOW" ? after : checkpoint;

    // 4. Customer-facing language from an approved template only.
    const response = approvedCustomerResponse({
      verdict,
      blockingRuleIds: guard.blockingRuleIds,
      reviewRuleIds: guard.reviewRuleIds,
      approvedAmountCents: dispatch.mockLedger ? dispatch.mockLedger.amountCents : null,
      ticketId: fixture.ticketId,
    });

    const checkpointRecord: CheckpointRecord = rollbackExecuted
      ? {
          restored: true,
          checkpointId: `lab-${sessionId}-chk-${step}`,
          promptHash: hashPrompt(healthy.prompt),
        }
      : { restored: false, checkpointId: null, promptHash: null };

    const policyProvenance: PolicyProvenance = {
      policyId: DEMO_POLICY.policyId,
      version: DEMO_POLICY.version,
      effectiveDate: DEMO_POLICY.effectiveDate,
      canonicalHash: demoPolicyCanonicalHash(),
    };

    const proposalRecord: ProposalRecord = {
      provider: proposal.provider,
      model: proposal.model,
      proposedAmountCents: proposal.proposedAmountCents,
      proposedTool: attemptedTool,
      citedEvidenceRefs: proposal.citedEvidenceRefs,
      claimedClaimType: proposal.claimType,
      claimedReviewThreat: proposal.claimedReviewThreat,
      proposedReplyHash: proposal.proposedReplyHash,
      latencyMs: proposal.latencyMs,
      validationOk: proposal.validation.ok,
    };

    const guardRecord: PolicyGuardRecord = {
      disposition: guard.disposition,
      reason: guard.reason,
      inputs: guardInputs,
      findings: guard.findings,
    };

    const capabilityRecord: CapabilityRecord = {
      attemptedTool: capability.attemptedTool,
      allowed: capability.allowed,
      reason: capability.reason,
      deniedCapabilities: capability.deniedCapabilities,
    };

    const ledgerRecord: MockLedgerRecord = dispatch.mockLedger
      ? {
          entryId: dispatch.mockLedger.entryId,
          amountCents: dispatch.mockLedger.amountCents,
          currency: dispatch.mockLedger.currency,
          status: dispatch.mockLedger.status,
          externalPaymentExecuted: dispatch.mockLedger.externalPaymentExecuted,
          entryHash: dispatch.mockLedger.entryHash,
        }
      : null;

    const responseRecord: CustomerResponseRecord = {
      templateId: response.templateId,
      policyClauseIds: response.policyClauseIds,
    };

    const simulatedExposureCents =
      verdict === "BLOCKED_BY_POLICY_GUARD"
        ? Math.min(guardInputs.proposedAmountCents, fixture.orderTotalCents)
        : 0;

    const eventPayload = {
      step,
      ticketId: step,
      ticketRef: fixture.ticketId,
      customerInputHash: ticketLabCustomerInputHash({
        ticketRef: fixture.ticketId,
        customerMessageHash: hashPrompt(signals.messageHashSource),
        provider: proposal.provider,
        proposedAmountCents: proposal.proposedAmountCents,
        proposedTool: attemptedTool,
      }),
      customerMessageHash: hashPrompt(signals.messageHashSource),
      workingPromptHash: hashPrompt(proposedState.prompt),
      driftScore: drift.driftScore,
      toolCalled: attemptedTool,
      toolArgs: { amount: guardInputs.proposedAmountCents / 100, currency: "EUR" },
      guardEvaluation: (guard.disposition === "BLOCK" ? "BLOCKED_BY_ACTION_GUARD" : "PASSED") as
        | "PASSED"
        | "BLOCKED_BY_ACTION_GUARD",
      verdict,
      reason,
      rollbackExecuted,
      restoredCheckpointHash: rollbackExecuted ? hashPrompt(healthy.prompt) : null,
      parentHash: trace.at(-1)?.stepHash ?? genesisPromptHash(),
      againstPolicy: false,
      paidAmount: dispatch.mockLedger ? dispatch.mockLedger.amountCents / 100 : 0,
      policy: policyProvenance,
      modelProposal: proposalRecord,
      policyGuard: guardRecord,
      capability: capabilityRecord,
      mockLedger: ledgerRecord,
      customerResponse: responseRecord,
      reviewDecision: verdict === "ALLOW" ? "not_required" : "queued_local_review_simulated",
      checkpoint: checkpointRecord,
      simulatedExposureCents,
      stateBefore: before,
      proposedState,
      stateAfter: after,
      jev,
      proposalValidation: proposal.validation,
      injectionMarkers: signals.injectionMarkers,
      threatMarkers: signals.threatMarkers,
    };

    const event = { ...eventPayload, stepHash: computeTraceHash(eventPayload) } as TraceEvent &
      typeof eventPayload;
    const nextTrace = [...trace, event];

    const workpaper = buildWorkpaper({
      workpaperId,
      mode: "watchdog_on",
      promptHash: genesisPromptHash(),
      trace: nextTrace,
      entity: DEMO_POLICY.entity,
      system: "SAAF Policy Circuit Breaker — Ticket Lab",
      withDemoPolicy: true,
    });
    const verification = verifyWorkpaper(workpaper);
    if (!verification.ok) {
      throw new Error(`INTERNAL_WORKPAPER_INTEGRITY_FAILURE: ${verification.message}`);
    }

    await tx
      .insert(sentinelSessions)
      .values({
        id: sessionId,
        activePrompt: after.prompt,
        activeMemory: after.memory,
        checkpointPrompt: healthy.prompt,
        checkpointMemory: healthy.memory,
        trace: nextTrace as unknown as Record<string, unknown>[],
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: sentinelSessions.id,
        set: {
          activePrompt: after.prompt,
          activeMemory: after.memory,
          checkpointPrompt: healthy.prompt,
          checkpointMemory: healthy.memory,
          trace: nextTrace as unknown as Record<string, unknown>[],
          updatedAt: new Date(),
        },
      });

    await tx.insert(ticketEvents).values({
      id: `lab-${sessionId}-${step}`,
      runId: `lab-${sessionId}`,
      ticketId: fixture.ticketId,
      ticketNumber: step,
      proposedAmount: guardInputs.proposedAmountCents / 100,
      paidAmount: event.paidAmount,
      toolName: attemptedTool,
      verdict,
      reason,
      driftScore: drift.driftScore,
      instructionDrift: drift.instructionDrift,
      memoryDrift: drift.memoryDrift,
      weakenedRules: drift.weakenedRules,
      action,
      workingPrompt: after.prompt,
      workingPromptHash: hashPrompt(after.prompt),
      memorySnapshot: after.memory,
      csatScore: 0,
      checkpointId: `lab-${sessionId}-chk-${step}`,
      rewriteOccurred: proposedState.prompt !== before.prompt,
      againstPolicy: false,
      stepHash: event.stepHash,
      parentHash: event.parentHash,
    });

    await tx.insert(checkpoints).values({
      id: `lab-${sessionId}-chk-${step}`,
      runId: `lab-${sessionId}`,
      checkpointKey: `lab-${step}`,
      promptContent: healthy.prompt,
      promptHash: hashPrompt(healthy.prompt),
      memorySnapshot: healthy.memory,
      healthy: true,
      ticketNumber: step,
    });

    const document = {
      workpaperId,
      runId: `lab-${sessionId}`,
      auditStandard: workpaper.auditStandard,
      entity: workpaper.metadata.entity,
      systemName: workpaper.metadata.system,
      genesis: workpaper.genesis as unknown as Record<string, unknown>,
      trace: nextTrace as unknown as Record<string, unknown>[],
      merkleRoot: workpaper.merkleRoot,
      auditSeal: workpaper.auditSeal,
      verified: verification.ok,
      verificationResult: verification as unknown as Record<string, unknown>,
      htmlReport: renderWorkpaperHtml(workpaper, verification),
    };
    await tx
      .insert(workpapers)
      .values({ id: `wp-lab-${sessionId}`, ...document })
      .onConflictDoUpdate({ target: workpapers.workpaperId, set: document });

    return {
      sessionId,
      ticket: {
        ticketId: fixture.ticketId,
        scenario: fixture.scenario,
        label: fixture.label,
        orderTotalCents: fixture.orderTotalCents,
        claimType: fixture.claimType,
        evidenceRefs: fixture.evidenceRefs,
        reviewThreatOnTicket: fixture.reviewThreatOnTicket,
      },
      customerMessageHash: event.customerMessageHash,
      injectionMarkers: signals.injectionMarkers,
      threatMarkers: signals.threatMarkers,
      proposal,
      policyGuard: guard,
      policy: policyProvenance,
      capability: capabilityRecord,
      dispatch: {
        status: dispatch.status,
        reason: dispatch.reason,
        mockLedger: dispatch.mockLedger,
      },
      customerResponse: response,
      verdict,
      action,
      reason,
      jev,
      drift,
      rollbackExecuted,
      activeState: after,
      checkpointHash: hashPrompt(healthy.prompt),
      humanReview: event.reviewDecision,
      persisted: true,
      paymentExecuted: false,
      simulatedExposureCents,
      metrics: computeLabMetrics(nextTrace, jev),
      workpaper,
      verification,
    };
  });
}
