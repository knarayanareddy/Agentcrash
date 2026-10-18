-- Additive, forward-only migration; existing demo/audit records are preserved.
-- Adds the mock ledger: the single observable side effect the Ticket Lab can
-- produce, reachable only through the dispatcher after SAAF allows an action.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE IF NOT EXISTS mock_ledger_entries (
  id text PRIMARY KEY,
  ticket_id text NOT NULL,
  workpaper_id text NOT NULL,
  tool_name text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL,
  status text NOT NULL,
  external_payment_executed boolean NOT NULL DEFAULT false,
  mock_account text NOT NULL,
  entry_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mock_ledger_entries_ticket_idx ON mock_ledger_entries (ticket_id);
COMMIT;
