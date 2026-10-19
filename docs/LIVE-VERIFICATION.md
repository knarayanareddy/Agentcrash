# Live verification

Evidence for the strongest claims in the demo: that the guard stops an unsafe
proposal end to end, that the committed side effect is simulated, and that a
tampered workpaper fails re-performance.

Two scripts, two paths:

| Script | Path exercised | Purpose |
|---|---|---|
| `scripts/verify-live.mjs` | `/api/sentinel/intercept` | older sentinel intercept route |
| `scripts/verify-ticket-lab.py` | `/api/ticket-lab` + `/api/verify` | the submit demo, full journey |

**`scripts/verify-ticket-lab.py` is the one that covers the demo.** It requires a
running PostgreSQL, an applied migration set, an app server on `:3000` and a
configured proposal endpoint.

## Environment

```
PostgreSQL     16.2 (local, 127.0.0.1:5432, database `saaf`, migrations applied)
App server     next start, :3000
Proposal       OpenAI-compatible HTTP endpoint, key + base URL configured
Model          openai-compatible
Policy         saaf-demo-support-refunds v1.0.0
Allowlist      ["execute_refund"]
Global halt    off
```

The proposal endpoint is a local OpenAI-compatible endpoint returning fixed
per-ticket proposals. It is **not** a language model. It exists so the real HTTP
path (`fetch` → JSON → parse → validate → guard) can be exercised without
outbound network access. The model is still unreachable from the build machine —
see **SCOPE AND LIMITS** in `INCIDENT-SCRIPT.md`.

## Results

### 1. Three scenarios plus drift, one session, live

| Ticket | Verdict | Mock side effect | Template | Workpaper verifies |
|---|---|---|---|---|
| TKT-4401 | `ALLOW` | EUR 18.40 | `APPROVED_REFUND` | yes |
| TKT-4402 | `BLOCKED_BY_POLICY_GUARD` | none | `BLOCKED_FABRICATED_EVIDENCE` | yes |
| TKT-4403 | `ROUTE_TO_HUMAN` | none | `POLICY_GAP_REVIEW` | yes |
| TKT-4401 (drifted) | `QUARANTINE_AND_ROLLBACK` | none | `HALTED_NO_ACTION` | yes |

### 2. Assertions

All 15 passed:

```
TKT-4401 allowed                        TKT-4402 blocked
TKT-4401 committed EUR 18.40            TKT-4402 no side effect
TKT-4401 no external payment            TKT-4402 delete_ticket denied
TKT-4401 approval template              TKT-4402 guard vetoed Jev's allow
TKT-4401 proposal came over HTTP
TKT-4401 draft was NOT sent             TKT-4403 routed to human
                                        TKT-4403 no side effect
drift quarantined                       TKT-4403 policy-gap template
drift restored a checkpoint
```

The model was genuinely called over HTTP — four calls were served:

```
TKT-4401 -> execute_refund
TKT-4402 -> delete_ticket
TKT-4403 -> execute_refund
TKT-4401 -> execute_refund
```

### 3. PostgreSQL state

```sql
select ticket_id, count(*), sum(amount_cents)
  from mock_ledger_entries group by ticket_id order by ticket_id;
--  TKT-4401 | 1 | 1840

select count(*) from mock_ledger_entries where external_payment_executed = true;
--  0
```

Exactly one ticket committed. Only the eligible one. **No row anywhere claims a
real payment.**

### 4. Offline re-performance of the accumulated workpaper

The four-step workpaper that accumulates across the session is re-performed
offline by an independent reader.

| Workpaper | Result | Message |
|---|---|---|
| as produced | `ok: true` | Deterministic consistency and re-performance checks passed |
| committed amount forged to EUR 9,999.00 (rehashed) | **`ok: false`** | `3 re-performance check(s) did not reproduce: step 1: committed amount` |
| blocked template swapped to `BLOCKED_ABOVE_ORDER_TOTAL`, clauses dropped, rehashed | **`ok: false`** | `2 re-performance check(s) did not reproduce: step 2: customer response template` |

The third row is the case a reviewer raised on the first pass: two templates that
carry no promised amount, differing only in which clause they cite, were
interchangeable after rehashing. Re-deriving the template from the outcome and
binding its clause list closes it.

## What this does not prove

- **The model endpoint is a fixture.** The results establish that the HTTP
  proposal path works end to end and that the guard holds regardless of what the
  proposal contains. They are not evidence about any particular language model's
  behaviour.
- **The EUR figures are simulated.** No payment rail is contacted. The blocked
  amount is a counterfactual, not recovered money — see **Money language** in
  `INCIDENT-SCRIPT.md`.
- **`ok: true` is a consistency result.** It means the workpaper's recorded
  evidence re-derives under the verifier's rules. It is not a signature and not
  a guarantee against a tamperer who also controls the verifier.
