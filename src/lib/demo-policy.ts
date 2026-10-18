import { hashJson } from "@/lib/hash";

/**
 * Synthetic demo policy.
 *
 * This is a fictional policy written for a hackathon prototype. It is NOT the
 * policy of any real company, and it must not be described as one. Every rule
 * carries an explicit id, disposition and verbatim clause so a decision can be
 * traced to the exact sentence that produced it.
 *
 * Two dispositions are deliberately distinct:
 *  - BLOCK  — permanently prohibited inside this demo. No payment, ever.
 *  - REVIEW — not prohibited, but outside the agent's unapproved authority.
 *             A supervisor may approve it. It routes to a human.
 *
 * Conflating the two is the classic way a policy engine starts lying: an
 * approvable over-cap refund described as "prohibited" reads as a bug to the
 * business, and a genuinely prohibited refund described as "needs review" reads
 * as a queue item nobody has to say no to.
 */

export type RuleDisposition = "BLOCK" | "REVIEW";

export type PolicyRule = {
  id: string;
  title: string;
  clause: string;
  disposition: RuleDisposition;
};

export type DemoPolicy = {
  policyId: string;
  version: string;
  effectiveDate: string;
  entity: string;
  currency: "EUR";
  syntheticNotice: string;
  unapprovedCapCents: number;
  coveredClaimTypes: string[];
  rules: PolicyRule[];
};

export const DEMO_POLICY: DemoPolicy = {
  policyId: "saaf-demo-support-refunds",
  version: "1.0.0",
  effectiveDate: "2026-10-01",
  entity: "Northwind Groceries (fictional demo retailer)",
  currency: "EUR",
  syntheticNotice:
    "Synthetic policy written for a hackathon prototype. It does not represent the policy of any real company.",
  unapprovedCapCents: 2000,
  coveredClaimTypes: ["food_quality", "damaged_item", "missing_item", "wrong_item"],
  rules: [
    {
      id: "R1-ORDER-TOTAL",
      title: "Never above the order total",
      clause: "A refund must not exceed the total value of the order it relates to.",
      disposition: "BLOCK",
    },
    {
      id: "R2-UNAPPROVED-CAP",
      title: "Unapproved authority cap",
      clause:
        "A refund above EUR 20.00 is not prohibited, but it may only be paid after a supervisor has approved it.",
      disposition: "REVIEW",
    },
    {
      id: "R3-VERIFIED-EVIDENCE",
      title: "Verified evidence for quality claims",
      clause:
        "Food-quality, damaged, missing and wrong-item claims require at least one evidence reference recorded on the ticket with status verified.",
      disposition: "REVIEW",
    },
    {
      id: "R4-THREAT-NOT-EVIDENCE",
      title: "Threats are not evidence",
      clause:
        "Review threats, blackmail or coercion are never grounds for a refund and never substitute for evidence.",
      disposition: "BLOCK",
    },
    {
      id: "R5-CLAIM-COVERAGE",
      title: "Claim type must be covered",
      clause:
        "Only the claim types listed in this policy are covered. A claim outside that list is not refused — it is routed to a human because this policy does not decide it.",
      disposition: "REVIEW",
    },
    {
      id: "R6-EVIDENCE-REFERENCE-EXISTS",
      title: "Cited evidence must exist",
      clause:
        "An evidence reference cited by the agent must exist on the ticket. A cited reference that is not on the ticket is treated as fabricated evidence.",
      disposition: "BLOCK",
    },
  ],
};

export const DEMO_RULE_IDS: string[] = DEMO_POLICY.rules.map((rule) => rule.id);

export function ruleById(id: string): PolicyRule | undefined {
  return DEMO_POLICY.rules.find((rule) => rule.id === id);
}

/** Fields that define the policy's meaning. Anything else is presentation. */
export function demoPolicyCanonical(): Record<string, unknown> {
  return {
    policyId: DEMO_POLICY.policyId,
    version: DEMO_POLICY.version,
    effectiveDate: DEMO_POLICY.effectiveDate,
    currency: DEMO_POLICY.currency,
    unapprovedCapCents: DEMO_POLICY.unapprovedCapCents,
    coveredClaimTypes: [...DEMO_POLICY.coveredClaimTypes].sort(),
    rules: DEMO_POLICY.rules.map((rule) => ({
      id: rule.id,
      clause: rule.clause,
      disposition: rule.disposition,
    })),
  };
}

/** Canonical hash of the policy bytes. Recorded in every workpaper. */
export function demoPolicyCanonicalHash(): string {
  return hashJson(demoPolicyCanonical());
}

/** The provenance block stamped onto a decision. */
export function demoPolicyProvenance() {
  return {
    policyId: DEMO_POLICY.policyId,
    version: DEMO_POLICY.version,
    effectiveDate: DEMO_POLICY.effectiveDate,
    canonicalHash: demoPolicyCanonicalHash(),
    entity: DEMO_POLICY.entity,
    syntheticNotice: DEMO_POLICY.syntheticNotice,
  };
}
