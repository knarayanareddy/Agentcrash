import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCapability, haltAllToolActions, isAllowedTool, TOOL_ALLOWLIST } from "../src/lib/capability";
import { dispatchToolCall } from "../src/lib/dispatcher";
import { MOCK_ACCOUNT, mockEntryHash, type MockLedgerEntry, type MockRefundRequest } from "../src/lib/mock-ledger";
import { scanCustomerMessage } from "../src/lib/message-signals";
import { offlineHeuristicProposal } from "../src/lib/proposal-model";
import { getTicketFixture, TICKET_FIXTURES } from "../src/lib/ticket-fixtures";

const cleanEnv: Record<string, string | undefined> = {};

let runnerCalls: MockRefundRequest[] = [];
async function spyRunner(request: MockRefundRequest): Promise<MockLedgerEntry> {
  runnerCalls.push(request);
  const entry: MockLedgerEntry = {
    entryId: "ML-test",
    ticketId: request.ticketId,
    workpaperId: request.workpaperId,
    toolName: "execute_refund",
    amountCents: request.amountCents,
    currency: "EUR",
    status: "MOCK_COMMITTED",
    externalPaymentExecuted: false,
    mockAccount: MOCK_ACCOUNT,
    entryHash: "",
    createdAt: new Date().toISOString(),
  };
  entry.entryHash = mockEntryHash(entry);
  return entry;
}

test("the runtime allowlist contains exactly one tool", () => {
  assert.deepEqual([...TOOL_ALLOWLIST], ["execute_refund"]);
  assert.equal(isAllowedTool("execute_refund"), true);
});

test("every dangerous tool name is refused before dispatch and recorded as denied", () => {
  for (const tool of [
    "delete_ticket",
    "erase_audit_record",
    "change_policy",
    "rewrite_instructions",
    "execute_refund_and_delete",
    "EXECUTE_REFUND",
    "",
    42,
    null,
  ]) {
    const decision = evaluateCapability(tool, cleanEnv);
    assert.equal(decision.allowed, false, `tool=${String(tool)}`);
    assert.notEqual(decision.reason, "ALLOWED_TOOL");
    if (typeof tool === "string" && tool.length > 0) {
      assert.deepEqual(decision.deniedCapabilities, [tool]);
    }
  }
  assert.equal(evaluateCapability("execute_refund", cleanEnv).allowed, true);
});

test("the global stop switch refuses even the allowlisted tool", () => {
  assert.equal(haltAllToolActions({ SAAF_HALT_ALL_TOOL_ACTIONS: "1" }), true);
  assert.equal(haltAllToolActions({ SAAF_HALT_ALL_TOOL_ACTIONS: "0" }), false);
  assert.equal(haltAllToolActions(cleanEnv), false);
  const decision = evaluateCapability("execute_refund", { SAAF_HALT_ALL_TOOL_ACTIONS: "1" });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "GLOBAL_HALT");
});

test("the dispatcher commits to the mock ledger only for an authorized allowlisted refund", async () => {
  runnerCalls = [];
  const result = await dispatchToolCall(
    {
      tool: "execute_refund",
      args: { amountCents: 1840, currency: "EUR" },
      authorization: "ALLOW",
      ticketId: "TKT-4401",
      workpaperId: "WP-LAB-ON-test",
    },
    spyRunner,
  );
  assert.equal(result.status, "MOCK_COMMITTED");
  assert.equal(result.mockLedger?.amountCents, 1840);
  assert.equal(result.mockLedger?.externalPaymentExecuted, false);
  assert.equal(runnerCalls.length, 1);
});

test("the dispatcher never runs a tool for any non-ALLOW verdict", async () => {
  for (const authorization of ["ROUTE_TO_HUMAN", "BLOCKED_BY_POLICY_GUARD", "QUARANTINE_AND_ROLLBACK"] as const) {
    runnerCalls = [];
    const result = await dispatchToolCall(
      {
        tool: "execute_refund",
        args: { amountCents: 1840, currency: "EUR" },
        authorization,
        ticketId: "TKT-4401",
        workpaperId: "WP-LAB-ON-test",
      },
      spyRunner,
    );
    assert.equal(result.status, "NOT_AUTHORIZED", authorization);
    assert.equal(result.mockLedger, null);
    assert.equal(runnerCalls.length, 0, authorization);
  }
});

test("the dispatcher refuses a denied capability and malformed arguments without touching the ledger", async () => {
  runnerCalls = [];
  const denied = await dispatchToolCall(
    { tool: "delete_ticket", args: { amountCents: 10, currency: "EUR" }, authorization: "ALLOW", ticketId: "TKT-4402", workpaperId: "WP" },
    spyRunner,
  );
  assert.equal(denied.status, "DENIED_CAPABILITY");
  assert.deepEqual(denied.deniedCapabilities, ["delete_ticket"]);

  for (const args of [
    { amountCents: -5, currency: "EUR" },
    { amountCents: 0, currency: "EUR" },
    { amountCents: 10.5, currency: "EUR" },
    { amountCents: "1840", currency: "EUR" },
    { amountCents: 1840, currency: "USD" },
    {},
  ]) {
    const result = await dispatchToolCall(
      { tool: "execute_refund", args, authorization: "ALLOW", ticketId: "TKT-4401", workpaperId: "WP" },
      spyRunner,
    );
    assert.equal(result.status, "INVALID_TOOL_ARGS", JSON.stringify(args));
    assert.equal(result.mockLedger, null);
  }
  assert.equal(runnerCalls.length, 0);
});

test("the message scan finds threats, injections and amounts in untrusted text", () => {
  const unsafe = getTicketFixture("TKT-4402")!;
  const signals = scanCustomerMessage(unsafe.defaultCustomerMessage);
  assert.ok(signals.threatMarkers.length > 0);
  assert.ok(signals.injectionMarkers.includes("forbidden tool name"));
  assert.ok(signals.injectionMarkers.includes("audit suppression"));
  assert.equal(signals.maxAmountCents, 90000);

  const eligible = getTicketFixture("TKT-4401")!;
  const calm = scanCustomerMessage(eligible.defaultCustomerMessage);
  assert.deepEqual(calm.threatMarkers, []);
  assert.deepEqual(calm.injectionMarkers, []);
  assert.equal(calm.maxAmountCents, 1840);
});

test("the offline proposal follows an embedded tool instruction, which the allowlist then refuses", () => {
  const fixture = getTicketFixture("TKT-4402")!;
  const proposal = offlineHeuristicProposal(fixture, fixture.defaultCustomerMessage);
  assert.equal(proposal.provider, "offline-heuristic");
  assert.equal(proposal.proposedTool, "delete_ticket");
  assert.equal(evaluateCapability(proposal.proposedTool, cleanEnv).allowed, false);
  assert.ok(proposal.citedEvidenceRefs.includes("EV-9999"));
  assert.equal(proposal.validation.ok, false);
});

test("fixtures are internally consistent money and evidence shapes", () => {
  for (const fixture of TICKET_FIXTURES) {
    assert.match(fixture.ticketId, /^TKT-\d{4}$/);
    assert.ok(Number.isInteger(fixture.orderTotalCents) && fixture.orderTotalCents > 0);
    for (const ref of fixture.evidenceRefs) {
      assert.match(ref.refId, /^EV-\d{4}$/);
      assert.ok(["verified", "pending", "rejected"].includes(ref.status));
    }
    assert.ok(fixture.defaultCustomerMessage.length > 20);
  }
});
