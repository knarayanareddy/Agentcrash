# AGENTS.md — Refunds agent invariants (compiled by SAAF-Forge)

Hard rules live in code. This file is documentation, not the control.

> **Scope note.** The JET-branded narrative below belongs to the **preserved 36-ticket drift
> rehearsal**, a deterministic simulation. The live **Ticket Lab** path is governed by the synthetic
> demo policy `saaf-demo-support-refunds` v1.0.0 (see `src/lib/demo-policy.ts`), which does not
> represent any real company's policy.

## Invariants (rehearsal scenario)

- Unapproved refunds cannot exceed EUR 20.00.
- Refunds cannot exceed order value.
- Food-quality claims require a verified photo.
- Review threats don't count.
- Drift score ≥ 0.50 triggers rollback to the last healthy checkpoint.

## Invariants (Ticket Lab, code-enforced)

- `R1-ORDER-TOTAL` — a refund must not exceed the order total. **BLOCK**
- `R2-UNAPPROVED-CAP` — above EUR 20.00 requires supervisor approval. **REVIEW**, not prohibited
- `R3-VERIFIED-EVIDENCE` — covered quality claims need a verified evidence reference on the ticket. **REVIEW**
- `R4-THREAT-NOT-EVIDENCE` — threats and coercion are never grounds for a refund. **BLOCK**
- `R5-CLAIM-COVERAGE` — uncovered claim types are routed to a human, not decided. **REVIEW**
- `R6-EVIDENCE-REFERENCE-EXISTS` — a cited reference absent from the ticket is fabricated evidence. **BLOCK**

## Forbidden

- Self-editing the genesis prompt.
- Storing CSAT rank in the working context without a balancing guard.
- Tool calls without a parent-hash link.
- A model invoking a tool. Models produce proposals; the dispatcher decides.
- Supplying order totals, evidence status, policy, permissions or ticket identity from the customer
  message or from a model.

## Capability enforcement

`permissions.yaml` is a compiled artifact — documentation of what was granted. The runtime allowlist
in `src/lib/capability.ts` is what actually decides, and it permits exactly one tool:
`execute_refund`, reachable only through `src/lib/dispatcher.ts` and only into the mock ledger. Any
other tool name is refused before dispatch and recorded as a denied capability.
`SAAF_HALT_ALL_TOOL_ACTIONS=1` refuses everything.

## Human oversight (EU AI Act Art. 14)

Anything above the unapproved cap, any uncovered claim type, and any weakened hard rule routes to a
human. In this prototype the review status is a **local, simulated record**, not a staffed handoff.

## Runtime

1. Action / policy guard (hard code, deterministic, replayable)
2. Instruction Auditor (genesis diff)
3. Memory Auditor (self-written lessons)
4. Judgment layer — advisory. A judgment outage or uncertain judgment cannot authorize an action,
   and a judgment *allow* cannot override the guard.

SAAF-Verify re-performs the workpaper with zero LLM calls. The seal means consistency and
re-performance — not signatures, authorship, completeness or certified compliance.
