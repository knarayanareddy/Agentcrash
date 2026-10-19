/**
 * Browser entry for the GitHub Pages playground.
 *
 * This bundles the ACTUAL modules the server runs — the same files, unchanged —
 * so the guard a judge exercises in the browser is the guard that gates the
 * mock ledger. Nothing is re-implemented for the demo.
 *
 * The only substitution is src/lib/hash.ts -> node:crypto, which the build
 * script aliases to a verified pure-JS SHA-256 (see sha256-browser.js).
 */

import {
  DEMO_POLICY,
  DEMO_RULE_IDS,
  ruleById,
  demoPolicyCanonicalHash,
  demoPolicyProvenance,
} from "@/lib/demo-policy";
import {
  TICKET_FIXTURES,
  getTicketFixture,
  fixtureEvidenceIds,
} from "@/lib/ticket-fixtures";
import {
  evaluatePolicyGuard,
  validatePolicyGuardInput,
} from "@/lib/policy-guard";
import type { PolicyGuardInput } from "@/lib/policy-guard";
import {
  evaluateCapability,
  isAllowedTool,
  haltAllToolActions,
  TOOL_ALLOWLIST,
} from "@/lib/capability";
import {
  approvedCustomerResponse,
  RESPONSE_TEMPLATE_IDS,
} from "@/lib/response-templates";
import { scanCustomerMessage, MAX_MESSAGE_CHARS } from "@/lib/message-signals";
import { formatEur, eurToCents, centsToEur, isCents } from "@/lib/money";

export {
  DEMO_POLICY,
  DEMO_RULE_IDS,
  ruleById,
  demoPolicyCanonicalHash,
  demoPolicyProvenance,
  TICKET_FIXTURES,
  getTicketFixture,
  fixtureEvidenceIds,
  evaluatePolicyGuard,
  validatePolicyGuardInput,
  evaluateCapability,
  isAllowedTool,
  haltAllToolActions,
  TOOL_ALLOWLIST,
  approvedCustomerResponse,
  RESPONSE_TEMPLATE_IDS,
  scanCustomerMessage,
  MAX_MESSAGE_CHARS,
  formatEur,
  eurToCents,
  centsToEur,
  isCents,
};

export type { PolicyGuardInput };

/** Convenience: everything needed to evaluate one proposal against one ticket. */
export function evaluateScenario(input: {
  ticketId: string;
  proposedAmountCents: number;
  proposedTool: string;
  citedEvidenceRefs?: string[];
  customerMessage?: string;
}) {
  const fixture = getTicketFixture(input.ticketId);
  if (!fixture) {
    return { error: `unknown ticket ${input.ticketId}` };
  }

  const signals = scanCustomerMessage(input.customerMessage ?? "");
  const guardInput: PolicyGuardInput = {
    orderTotalCents: fixture.orderTotalCents,
    claimType: fixture.claimType,
    verifiedEvidenceRefs: fixture.evidenceRefs
      .filter((ref) => ref.status === "verified")
      .map((ref) => ref.refId),
    allEvidenceRefs: fixture.evidenceRefs.map((ref) => ref.refId),
    reviewThreatOnTicket: fixture.reviewThreatOnTicket,
    threatMarkers: signals.threatMarkers,
    proposedAmountCents: input.proposedAmountCents,
    citedEvidenceRefs: input.citedEvidenceRefs ?? [],
  };

  const guard = evaluatePolicyGuard(guardInput);
  const capability = evaluateCapability(input.proposedTool, {});

  // The verdict ladder, minus the parts that need a database or a model.
  let verdict: string;
  if (guard.disposition === "BLOCK") {
    verdict = "BLOCKED_BY_POLICY_GUARD";
  } else if (!capability.allowed) {
    verdict = "BLOCKED_BY_POLICY_GUARD";
  } else if (guard.disposition === "REVIEW") {
    verdict = "ROUTE_TO_HUMAN";
  } else {
    verdict = "ALLOW";
  }

  const response = approvedCustomerResponse({
    verdict,
    blockingRuleIds: guard.blockingRuleIds,
    reviewRuleIds: guard.reviewRuleIds,
    approvedAmountCents: verdict === "ALLOW" ? input.proposedAmountCents : null,
    ticketId: fixture.ticketId,
  });

  return {
    fixture,
    signals,
    guard,
    capability,
    verdict,
    response,
    // Only the server can commit; state plainly what this page does not do.
    mockLedgerCommitted: false,
  };
}
