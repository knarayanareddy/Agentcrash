import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { mockLedgerEntries } from "@/db/schema";
import { hashJson } from "@/lib/hash";
import { isCents } from "@/lib/money";

/** Accepts the pooled db or a transaction handle so the entry commits atomically. */
export type LedgerClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The mock ledger — the only side effect in the system.
 *
 * It is a local demo ledger. It moves no real money, calls no payment
 * processor, and `externalPaymentExecuted` is structurally always false. What
 * it buys the demo is observability: the difference between "a model proposed
 * €18.40" and "SAAF committed €18.40 to a ledger" becomes something you can
 * point at, and the absence of a row is itself evidence that a proposal never
 * became an action.
 */

export type MockLedgerEntry = {
  entryId: string;
  ticketId: string;
  workpaperId: string;
  toolName: string;
  amountCents: number;
  currency: "EUR";
  status: "MOCK_COMMITTED";
  externalPaymentExecuted: false;
  mockAccount: string;
  entryHash: string;
  createdAt: string;
};

export const MOCK_ACCOUNT = "MOCK-DEMO-LEDGER-0001";

export function mockEntryHash(entry: Omit<MockLedgerEntry, "entryHash">): string {
  return hashJson({
    entryId: entry.entryId,
    ticketId: entry.ticketId,
    workpaperId: entry.workpaperId,
    toolName: entry.toolName,
    amountCents: entry.amountCents,
    currency: entry.currency,
    status: entry.status,
    externalPaymentExecuted: entry.externalPaymentExecuted,
    mockAccount: entry.mockAccount,
  });
}

export type MockRefundRequest = {
  ticketId: string;
  workpaperId: string;
  amountCents: number;
  currency: "EUR";
};

/** Only reachable through the dispatcher. Never called directly by a model. */
export async function commitMockRefund(
  client: LedgerClient,
  request: MockRefundRequest,
): Promise<MockLedgerEntry> {
  if (!isCents(request.amountCents) || request.amountCents === 0) {
    throw new Error("MOCK_LEDGER_INVALID_AMOUNT");
  }
  if (request.currency !== "EUR") throw new Error("MOCK_LEDGER_UNSUPPORTED_CURRENCY");
  if (typeof request.ticketId !== "string" || !/^[A-Z]{3}-\d{3,6}$/.test(request.ticketId)) {
    throw new Error("MOCK_LEDGER_INVALID_TICKET");
  }

  const entry: MockLedgerEntry = {
    entryId: `ML-${randomUUID()}`,
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

  await client.insert(mockLedgerEntries).values({
    id: entry.entryId,
    ticketId: entry.ticketId,
    workpaperId: entry.workpaperId,
    toolName: entry.toolName,
    amountCents: entry.amountCents,
    currency: entry.currency,
    status: entry.status,
    externalPaymentExecuted: entry.externalPaymentExecuted,
    mockAccount: entry.mockAccount,
    entryHash: entry.entryHash,
  });

  return entry;
}
