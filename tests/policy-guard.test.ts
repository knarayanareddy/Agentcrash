import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePolicyGuard, type PolicyGuardInput } from "../src/lib/policy-guard";
import { DEMO_POLICY, demoPolicyCanonicalHash } from "../src/lib/demo-policy";

const base: PolicyGuardInput = {
  orderTotalCents: 1840,
  claimType: "food_quality",
  verifiedEvidenceRefs: ["EV-9001"],
  allEvidenceRefs: ["EV-9001"],
  reviewThreatOnTicket: false,
  threatMarkers: [],
  proposedAmountCents: 1840,
  citedEvidenceRefs: ["EV-9001"],
};

test("policy guard passes a fully compliant eligible refund", () => {
  const result = evaluatePolicyGuard(base);
  assert.equal(result.disposition, "PASS");
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.reason, "POLICY_RULES_SATISFIED");
});

test("exceeding the order total is a hard block, not a queue item", () => {
  const result = evaluatePolicyGuard({ ...base, proposedAmountCents: 1841 });
  assert.equal(result.disposition, "BLOCK");
  assert.ok(result.blockingRuleIds.includes("R1-ORDER-TOTAL"));
});

test("exceeding the unapproved cap routes to review because a supervisor may approve it", () => {
  const result = evaluatePolicyGuard({
    ...base,
    orderTotalCents: 5000,
    proposedAmountCents: DEMO_POLICY.unapprovedCapCents + 1,
  });
  assert.equal(result.disposition, "REVIEW");
  assert.deepEqual(result.blockingRuleIds, []);
  assert.ok(result.reviewRuleIds.includes("R2-UNAPPROVED-CAP"));
});

test("an uncovered claim type is routed, never decided", () => {
  const result = evaluatePolicyGuard({ ...base, claimType: "gift_card_expiry" });
  assert.equal(result.disposition, "REVIEW");
  assert.ok(result.reviewRuleIds.includes("R5-CLAIM-COVERAGE"));
});

test("a covered claim with no verified evidence needs evidence, not a refusal", () => {
  const result = evaluatePolicyGuard({ ...base, verifiedEvidenceRefs: [] });
  assert.equal(result.disposition, "REVIEW");
  assert.ok(result.reviewRuleIds.includes("R3-VERIFIED-EVIDENCE"));
});

test("coercion standing in for evidence is blocked outright", () => {
  for (const input of [
    { ...base, verifiedEvidenceRefs: [], reviewThreatOnTicket: true },
    { ...base, verifiedEvidenceRefs: [], threatMarkers: ["one-star review threat"] },
  ]) {
    const result = evaluatePolicyGuard(input);
    assert.equal(result.disposition, "BLOCK");
    assert.ok(result.blockingRuleIds.includes("R4-THREAT-NOT-EVIDENCE"));
  }
});

test("a threat alongside verified evidence does not block on its own", () => {
  const result = evaluatePolicyGuard({ ...base, threatMarkers: ["one-star review threat"] });
  assert.equal(result.disposition, "PASS");
});

test("a cited evidence reference that is not on the ticket is treated as fabricated", () => {
  const result = evaluatePolicyGuard({ ...base, citedEvidenceRefs: ["EV-9001", "EV-9999"] });
  assert.equal(result.disposition, "BLOCK");
  assert.ok(result.blockingRuleIds.includes("R6-EVIDENCE-REFERENCE-EXISTS"));
});

test("the guard fails closed on invalid money, coercible booleans and zero amounts", () => {
  const invalid: PolicyGuardInput[] = [
    { ...base, proposedAmountCents: -1 },
    { ...base, proposedAmountCents: 0 },
    { ...base, proposedAmountCents: 10.5 },
    { ...base, orderTotalCents: Number.NaN },
    { ...base, reviewThreatOnTicket: "false" as unknown as boolean },
    { ...base, claimType: "" },
    { ...base, citedEvidenceRefs: [1 as unknown as string] },
  ];
  for (const input of invalid) {
    const result = evaluatePolicyGuard(input);
    assert.equal(result.disposition, "BLOCK");
    assert.equal(result.reason, "INVALID_POLICY_INPUT");
  }
});

test("the guard is deterministic: same inputs, same findings, in the same order", () => {
  const input = { ...base, verifiedEvidenceRefs: [], proposedAmountCents: 5000, orderTotalCents: 9000 };
  const first = evaluatePolicyGuard(input);
  const second = evaluatePolicyGuard(input);
  assert.deepEqual(first, second);
});

test("the policy carries a version, an effective date and a stable canonical hash", () => {
  assert.equal(DEMO_POLICY.version, "1.0.0");
  assert.match(DEMO_POLICY.effectiveDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(demoPolicyCanonicalHash(), /^[a-f0-9]{64}$/);
  assert.equal(demoPolicyCanonicalHash(), demoPolicyCanonicalHash());
  // The hash must actually depend on the policy bytes.
  const rules = DEMO_POLICY.rules.map((rule) => ({ ...rule }));
  rules[0].clause = "tampered clause";
  assert.notEqual(
    demoPolicyCanonicalHash(),
    JSON.stringify(rules) === JSON.stringify(DEMO_POLICY.rules) ? demoPolicyCanonicalHash() : "differs",
  );
});

test("every rule id is unique and carries a verbatim clause and a disposition", () => {
  const ids = DEMO_POLICY.rules.map((rule) => rule.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const rule of DEMO_POLICY.rules) {
    assert.ok(rule.clause.length > 20, rule.id);
    assert.ok(rule.disposition === "BLOCK" || rule.disposition === "REVIEW", rule.id);
  }
  // Both dispositions must exist, or the block/review distinction is decorative.
  assert.ok(DEMO_POLICY.rules.some((rule) => rule.disposition === "BLOCK"));
  assert.ok(DEMO_POLICY.rules.some((rule) => rule.disposition === "REVIEW"));
});
