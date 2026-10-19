import { DEMO_POLICY } from "@/lib/demo-policy";

/**
 * Approved customer responses.
 *
 * The model's free-form draft is retained in the workpaper as evidence of what
 * the agent wanted to say. It is never sent. What the customer receives is one
 * of these templates, selected by the SAAF outcome and citing the rule ids that
 * produced it.
 *
 * This is the boundary that keeps a generated reply from becoming a policy
 * promise the business never made — the failure mode behind Air Canada's
 * C$812.02 bereavement-fare ruling — and from becoming a channel for hostile or
 * manipulated output.
 */

export type ResponseTemplateId =
  | "APPROVED_REFUND"
  | "NEEDS_MORE_EVIDENCE"
  | "HUMAN_REVIEW"
  | "BLOCKED_FABRICATED_EVIDENCE"
  | "BLOCKED_ABOVE_ORDER_TOTAL"
  | "BLOCKED_COERCION"
  | "POLICY_GAP_REVIEW"
  | "HALTED_NO_ACTION";

export type CustomerResponse = {
  templateId: ResponseTemplateId;
  policyClauseIds: string[];
  text: string;
  amountCents: number | null;
};

/**
 * Shown wherever a customer response is displayed. The response text below is
 * what a deployment with a real processor and a staffed review queue would
 * send. This prototype has neither: the ledger is mock and review is a local
 * simulated status. Say so wherever the text is shown, so a preview is never
 * mistaken for a message that was sent.
 */
export const RESPONSE_PREVIEW_NOTICE =
  "Simulated response preview — not sent to any customer. No real payment is made and review is a local simulated status, not a staffed handoff.";

function render(
  templateId: ResponseTemplateId,
  policyClauseIds: string[],
  amountCents: number | null,
  body: string,
): CustomerResponse {
  return {
    templateId,
    policyClauseIds,
    amountCents,
    text: `${body}\n\nReference: ${DEMO_POLICY.policyId} v${DEMO_POLICY.version} · ${
      policyClauseIds.length > 0 ? `clauses ${policyClauseIds.join(", ")}` : "no policy clause cited; escalated by the judgment layer"
    }.`,
  };
}

export function approvedCustomerResponse(input: {
  verdict: string;
  blockingRuleIds: string[];
  reviewRuleIds: string[];
  approvedAmountCents: number | null;
  ticketId: string;
}): CustomerResponse {
  const { verdict, blockingRuleIds, reviewRuleIds, approvedAmountCents, ticketId } = input;
  const ticket = `ticket ${ticketId}`;

  if (verdict === "ALLOW" && approvedAmountCents !== null) {
    return render(
      "APPROVED_REFUND",
      reviewRuleIds.length > 0 ? reviewRuleIds : ["R1-ORDER-TOTAL", "R3-VERIFIED-EVIDENCE"],
      approvedAmountCents,
      // No payout timeline: this system records an approval, it does not move
      // money. Promising 3–5 working days would be a promise the prototype
      // cannot keep, and external_payment_executed is structurally false.
      `Thanks for letting us know, and sorry about the order. We have approved a refund of €${(approvedAmountCents / 100).toFixed(2)} for ${ticket}.`,
    );
  }

  if (verdict === "QUARANTINE_AND_ROLLBACK") {
    return render(
      "HALTED_NO_ACTION",
      ["R1-ORDER-TOTAL"],
      null,
      `Thanks for your patience. Your request on ${ticket} has been passed to our support team, who will reply to you directly. No refund has been processed yet.`,
    );
  }

  if (verdict === "BLOCKED_BY_POLICY_GUARD") {
    if (blockingRuleIds.includes("R6-EVIDENCE-REFERENCE-EXISTS")) {
      return render(
        "BLOCKED_FABRICATED_EVIDENCE",
        ["R6-EVIDENCE-REFERENCE-EXISTS", "R3-VERIFIED-EVIDENCE"],
        null,
        `We could not match the evidence referenced on ${ticket} to anything on your order, so we have not processed a refund. Please upload a clear photo of the delivered order and we will pick it straight back up.`,
      );
    }
    if (blockingRuleIds.includes("R1-ORDER-TOTAL")) {
      return render(
        "BLOCKED_ABOVE_ORDER_TOTAL",
        ["R1-ORDER-TOTAL"],
        null,
        `We are not able to refund more than the value of the order on ${ticket}. If you believe part of your request is separate from that order, our support team can look at it with you.`,
      );
    }
    if (blockingRuleIds.includes("R4-THREAT-NOT-EVIDENCE")) {
      return render(
        "BLOCKED_COERCION",
        ["R4-THREAT-NOT-EVIDENCE", "R3-VERIFIED-EVIDENCE"],
        null,
        `We want to resolve ${ticket} properly. A refund decision on this ticket needs evidence we can verify rather than anything else, so please upload a photo of the delivered order and we will review it as a priority.`,
      );
    }
    return render(
      "HALTED_NO_ACTION",
      blockingRuleIds.length > 0 ? blockingRuleIds : ["R1-ORDER-TOTAL"],
      null,
      `We have not processed a refund on ${ticket}. Our support team has the details and will get back to you.`,
    );
  }

  // ROUTE_TO_HUMAN and everything else fail closed to a human path.
  if (reviewRuleIds.includes("R5-CLAIM-COVERAGE")) {
    return render(
      "POLICY_GAP_REVIEW",
      ["R5-CLAIM-COVERAGE"],
      null,
      `Thanks for raising this on ${ticket}. This type of request is handled by a member of our team rather than automatically, so it has been passed to them for a decision. We will reply to you with the outcome.`,
    );
  }
  if (reviewRuleIds.includes("R3-VERIFIED-EVIDENCE")) {
    return render(
      "NEEDS_MORE_EVIDENCE",
      ["R3-VERIFIED-EVIDENCE"],
      null,
      `We would like to help with ${ticket}, but we still need evidence we can verify. Please upload a clear photo of the delivered order and we will continue your refund request.`,
    );
  }
  if (reviewRuleIds.includes("R2-UNAPPROVED-CAP")) {
    return render(
      "HUMAN_REVIEW",
      ["R2-UNAPPROVED-CAP"],
      null,
      `Your request on ${ticket} is above the amount we can approve automatically, so it has gone to a supervisor for approval. We will come back to you with the decision.`,
    );
  }
  return render(
    "HUMAN_REVIEW",
    reviewRuleIds,
    null,
    `Your request on ${ticket} has been passed to our support team for review. We will reply to you with the outcome.`,
  );
}

export const RESPONSE_TEMPLATE_IDS: ResponseTemplateId[] = [
  "APPROVED_REFUND",
  "NEEDS_MORE_EVIDENCE",
  "HUMAN_REVIEW",
  "BLOCKED_FABRICATED_EVIDENCE",
  "BLOCKED_ABOVE_ORDER_TOTAL",
  "BLOCKED_COERCION",
  "POLICY_GAP_REVIEW",
  "HALTED_NO_ACTION",
];

/** Templates that may only ever accompany an ALLOW verdict. */
export const APPROVAL_TEMPLATE_IDS: ResponseTemplateId[] = ["APPROVED_REFUND"];
