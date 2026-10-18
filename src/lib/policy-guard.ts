import { DEMO_POLICY, ruleById } from "@/lib/demo-policy";
import { isCents } from "@/lib/money";

/**
 * The deterministic policy guard.
 *
 * This function is the only thing that decides whether a refund proposal may be
 * paid. A model may describe a situation, propose an amount and draft a reply;
 * it cannot turn prose into permission. Every finding names the rule id and the
 * verbatim clause that produced it, and the whole call is pure and replayable —
 * the offline verifier re-runs it against the recorded inputs and compares.
 */

export type PolicyGuardInput = {
  orderTotalCents: number;
  claimType: string;
  /** Trusted: refs on the ticket whose status is verified. */
  verifiedEvidenceRefs: string[];
  /** Trusted: every ref on the ticket, any status. */
  allEvidenceRefs: string[];
  reviewThreatOnTicket: boolean;
  /** Trusted: deterministic server-side scan of the untrusted message. */
  threatMarkers: string[];
  /** From the validated model proposal. */
  proposedAmountCents: number;
  /** Claimed by the model; validated against the trusted ticket here. */
  citedEvidenceRefs: string[];
};

export type PolicyFinding = {
  ruleId: string;
  disposition: "BLOCK" | "REVIEW";
  detail: string;
};

export type PolicyGuardDisposition = "PASS" | "REVIEW" | "BLOCK";

export type PolicyGuardResult = {
  disposition: PolicyGuardDisposition;
  ok: boolean;
  findings: PolicyFinding[];
  matchedRuleIds: string[];
  blockingRuleIds: string[];
  reviewRuleIds: string[];
  reason: string;
};

function fail(detail: string): PolicyGuardResult {
  return {
    disposition: "BLOCK",
    ok: false,
    findings: [{ ruleId: "INVALID_POLICY_INPUT", disposition: "BLOCK", detail }],
    matchedRuleIds: ["INVALID_POLICY_INPUT"],
    blockingRuleIds: ["INVALID_POLICY_INPUT"],
    reviewRuleIds: [],
    reason: "INVALID_POLICY_INPUT",
  };
}

function strings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 50 &&
    value.every((item) => typeof item === "string" && item.length <= 200)
  );
}

export function validatePolicyGuardInput(input: unknown): input is PolicyGuardInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return (
    isCents(value.orderTotalCents) &&
    typeof value.claimType === "string" &&
    value.claimType.length > 0 &&
    value.claimType.length <= 100 &&
    strings(value.verifiedEvidenceRefs) &&
    strings(value.allEvidenceRefs) &&
    typeof value.reviewThreatOnTicket === "boolean" &&
    strings(value.threatMarkers) &&
    isCents(value.proposedAmountCents) &&
    strings(value.citedEvidenceRefs)
  );
}

export function evaluatePolicyGuard(input: PolicyGuardInput): PolicyGuardResult {
  if (!validatePolicyGuardInput(input)) {
    return fail("Policy inputs must be integer cents, bounded strings and real booleans.");
  }
  if (input.proposedAmountCents === 0) {
    return fail("A refund proposal must be a positive amount.");
  }

  const findings: PolicyFinding[] = [];
  const clause = (id: string) => ruleById(id)?.clause ?? id;

  // R1 — hard block: never above the order total.
  if (input.proposedAmountCents > input.orderTotalCents) {
    findings.push({
      ruleId: "R1-ORDER-TOTAL",
      disposition: "BLOCK",
      detail: `Proposed €${(input.proposedAmountCents / 100).toFixed(2)} exceeds the order total €${(input.orderTotalCents / 100).toFixed(2)}. ${clause("R1-ORDER-TOTAL")}`,
    });
  }

  // R2 — approval threshold, not a prohibition.
  if (input.proposedAmountCents > DEMO_POLICY.unapprovedCapCents) {
    findings.push({
      ruleId: "R2-UNAPPROVED-CAP",
      disposition: "REVIEW",
      detail: `Proposed €${(input.proposedAmountCents / 100).toFixed(2)} is above the unapproved cap €${(DEMO_POLICY.unapprovedCapCents / 100).toFixed(2)}; a supervisor may approve it. ${clause("R2-UNAPPROVED-CAP")}`,
    });
  }

  // R3 — covered quality claims need verified evidence on the ticket.
  const covered = DEMO_POLICY.coveredClaimTypes.includes(input.claimType);
  if (covered && input.verifiedEvidenceRefs.length === 0) {
    findings.push({
      ruleId: "R3-VERIFIED-EVIDENCE",
      disposition: "REVIEW",
      detail: `Claim type '${input.claimType}' has no verified evidence reference on the ticket. ${clause("R3-VERIFIED-EVIDENCE")}`,
    });
  }

  // R4 — coercion standing in for evidence is a hard block, not a queue item.
  const threatened = input.reviewThreatOnTicket || input.threatMarkers.length > 0;
  if (threatened && input.verifiedEvidenceRefs.length === 0) {
    findings.push({
      ruleId: "R4-THREAT-NOT-EVIDENCE",
      disposition: "BLOCK",
      detail: `Pressure detected (${input.reviewThreatOnTicket ? "recorded on ticket" : "in message"}) with no verified evidence on the ticket. ${clause("R4-THREAT-NOT-EVIDENCE")}`,
    });
  }

  // R5 — uncovered claim types are routed, not invented around.
  if (!covered) {
    findings.push({
      ruleId: "R5-CLAIM-COVERAGE",
      disposition: "REVIEW",
      detail: `Claim type '${input.claimType}' is not covered by ${DEMO_POLICY.policyId} v${DEMO_POLICY.version}. ${clause("R5-CLAIM-COVERAGE")}`,
    });
  }

  // R6 — a cited reference that is not on the ticket is fabricated evidence.
  const fabricated = input.citedEvidenceRefs.filter(
    (ref) => !input.allEvidenceRefs.includes(ref),
  );
  if (fabricated.length > 0) {
    findings.push({
      ruleId: "R6-EVIDENCE-REFERENCE-EXISTS",
      disposition: "BLOCK",
      detail: `Cited evidence ${fabricated.join(", ")} is not on this ticket. ${clause("R6-EVIDENCE-REFERENCE-EXISTS")}`,
    });
  }

  const blockingRuleIds = findings.filter((f) => f.disposition === "BLOCK").map((f) => f.ruleId);
  const reviewRuleIds = findings.filter((f) => f.disposition === "REVIEW").map((f) => f.ruleId);
  const disposition: PolicyGuardDisposition =
    blockingRuleIds.length > 0 ? "BLOCK" : reviewRuleIds.length > 0 ? "REVIEW" : "PASS";

  const reason =
    disposition === "BLOCK"
      ? `BLOCKED_BY_${blockingRuleIds[0]}`
      : disposition === "REVIEW"
        ? `REVIEW_REQUIRED_BY_${reviewRuleIds[0]}`
        : "POLICY_RULES_SATISFIED";

  return {
    disposition,
    ok: disposition === "PASS",
    findings,
    matchedRuleIds: findings.map((f) => f.ruleId),
    blockingRuleIds,
    reviewRuleIds,
    reason,
  };
}
