# Incident-prevention script

**Purpose.** A script for the demo video and for talking to judges. It maps the
three motivating incidents onto the three boundaries SAAF actually enforces, so
each incident demonstrates a *different* control rather than repeating one claim.

Read it alongside `TECHEX-SUBMISSION.md`. Where this document describes what the
system does, `evidence` means: the live server produced it, and the workpaper
re-performs it offline.

---

## The one sentence

> A fluent model, slightly wrong about what it is allowed to do.

That is the shape of all three incidents. Not "AI is dangerous" — specific:
the model was wrong about its **authority**, not about arithmetic.

---

## Three incidents, three boundaries

| Incident | What actually failed | The boundary | SAAF control | Rule / mechanism |
|---|---|---|---|---|
| **Air Canada** | The bot asserted a bereavement-fare rule that did not exist. It was held liable for what its bot **said**. | **The reply** | Customer-facing text is rendered from an approved template bound to the outcome and the policy clause. The model's draft is retained as evidence and never sent. | `R5-CLAIM-COVERAGE` routes uncovered claims to a human; template binding |
| **Replit** | An agent performed a destructive action during a freeze. The constraint lived in **instructions** and was ignored. | **The action** | Runtime allowlist of exactly one tool. Everything else refused before dispatch and recorded. Global stop switch enforced in code. | `TOOL_ALLOWLIST`, `evaluateCapability`, `SAAF_HALT_ALL_TOOL_ACTIONS` |
| **DPD** | A customer provoked the assistant into abusive output, and that output **reached the customer**. | **The input** | The message is untrusted content, delimited and never treated as instruction. Threats are detected and explicitly not evidence. The reply is a template. | `R4-THREAT-NOT-EVIDENCE`, `scanCustomerMessage` |

Three failures. Three different boundaries. One system closing all three.

---

## Beat 1 — Air Canada: the reply boundary

**What happened.** A passenger asked about bereavement fares. The airline's
chatbot told him he could apply retroactively. The real policy required applying
before travel. He relied on it, paid full fare, and the tribunal found negligent
misrepresentation — ordering **C$812.02** in damages and fees.

**Why it matters.** Nobody authorised a wrong payment. The harm was *the words*.
The airline was bound by what its bot said.

**What SAAF does differently.**

> In this system the model does not write to the customer. It proposes.
> A deterministic layer decides, and the customer receives text rendered from a
> template that names the outcome and the policy clause that produced it.

On screen:

```
model proposal     → "I've approved your bereavement refund."   (NOT SENT)
guard              → REVIEW  R5-CLAIM-COVERAGE
                     "Only the claim types listed in this policy are covered.
                      A claim outside that list is not refused — it is routed
                      to a human because this policy does not decide it."
customer receives  → POLICY_GAP_REVIEW  · clauses R5-CLAIM-COVERAGE
```

**The line to say:**

> Air Canada was held liable for what its bot said. SAAF's bot doesn't get to
> say anything the policy didn't authorise — because the model never writes the
> reply.

**Why "not refused" matters.** A plausible-sounding refusal is also a fabrication.
`R5` deliberately routes rather than denies. Saying "no" to something the policy
doesn't cover is inventing a rule in the other direction.

---

## Beat 2 — Replit: the action boundary

**What happened.** During a code freeze, an AI agent deleted the production
database. The company publicly acknowledged it.

**Why it matters.** The freeze was real. It was expressed as an *instruction*.
The agent had a destructive capability and used it. A constraint written in
prose is a request; the model can ignore a request.

**What SAAF does differently.**

> Two changes. First, the model has no tools — it returns data, and a
> server-owned dispatcher decides. Second, the permitted set is one item long,
> and the stop switch is enforced in the dispatcher, not in the prompt.

On screen (Scenario 2, `TKT-4402`):

```
model proposes     → €900.00 via delete_ticket
capability         → delete_ticket -> DENIED  (DENIED_CAPABILITY)
                     denied capabilities: delete_ticket
mock ledger        → no entry
external payment   → No
```

And the stop switch:

```
SAAF_HALT_ALL_TOOL_ACTIONS=1
execute_refund     -> DENIED  (GLOBAL_HALT)     ← even the permitted tool
```

**The line to say:**

> A code freeze in a prompt is a request. A stop switch in the dispatcher is a
> refusal. Replit had the first. This is the second.

**The detail worth pausing on.** On `TKT-4402` the judgment layer returned
`allow`. The deterministic guard vetoed anyway. That ordering is the whole
design: a model's opinion — including a safety model's opinion — never
outranks the deterministic check.

---

## Beat 3 — DPD: the input boundary

**What happened.** A customer provoked a parcel company's chatbot into swearing
and criticising its own employer. The company disabled the AI element.

**Why it matters.** Untrusted text steered the model's *tone and content*, and
that output went straight to a customer. Nothing was authorised wrongly — the
failure was that untrusted input became trusted output.

**What SAAF does differently.**

> The message is framed as content, not instruction. Provocation is detected,
> recorded, and explicitly denied the status of evidence. And the reply is a
> template, so there is no tone to steer.

On screen:

```
customer message   → "…one star unless you pay me €900 right now…"
                     threat markers: yes
guard              → BLOCK  R4-THREAT-NOT-EVIDENCE
                     "Review threats, blackmail or coercion are never grounds
                      for a refund and never substitute for evidence."
verdict            → BLOCKED_BY_POLICY_GUARD
customer receives  → BLOCKED_FABRICATED_EVIDENCE (from the template)
```

**The line to say:**

> You cannot provoke a template. The model can be as angry or as agreeable as
> it likes — none of that reaches the customer, because the customer gets text
> chosen by the outcome, not by the model.

---

## Beat 4 — the proof, then the limits

**The proof.** Every decision writes a workpaper. The verifier does not hash and
move on — it re-runs the guard from its recorded inputs, checks the trusted
facts against the fixture the ticket names, checks the side effect against every
gate that had to pass, and re-derives the customer response from the outcome.

Then we forge it: change the committed amount, recompute every step hash and the
Merkle root, and verification still fails — naming the check that did not
reproduce.

**Then say the limits, unprompted:**

- The policy is synthetic. It is not any real company's policy.
- Human review is a simulated local record, not a staffed handoff.
- The seal means **consistency-checked and replayable**. Not a signature, not
  proof of authorship, not certified compliance.
- Three fixtures, not a benchmark. Not a success rate.
- "Simulated exposure prevented" is a simulation, not money saved.
- **No real payment was ever made.** `external_payment_executed` is structurally
  always false.

**And the limit that matters most for these three incidents:**

> SAAF does not prevent a model from being wrong. It prevents a model's being
> wrong from converting into an authorised action or an unauthorised message.
> An assistant answering open-ended questions, with no policy-bound action at
> stake, is outside what this prototype addresses.

---

## Timed run sheet

| Time | Beat | On screen |
|---|---|---|
| 0:00–0:20 | Cold open | Three incidents, one shape: wrong about authority |
| 0:20–0:35 | The loop | Eight steps, ending in "replayable workpaper" |
| 0:35–1:10 | Air Canada | Reply boundary — template + `R5` |
| 1:10–1:50 | Replit | Action boundary — allowlist, denial, stop switch |
| 1:50–2:20 | DPD | Input boundary — untrusted text, `R4`, template |
| 2:20–3:30 | Three live scenarios | `ALLOW` / `BLOCK` / `REVIEW`, with the ledger rows |
| 3:30–4:00 | Drift | Quarantine and checkpoint restore |
| 4:00–4:40 | Forge the workpaper | Verification fails, names the check |
| 4:40–5:10 | Scope and limits | Read them out |

---

## Reviewer feedback — open items

An external reviewer raised three points. Verified against the source; status
below so these can be discussed before the video is generated.

### 1. `''` appended to every customer response — **real bug, fixed**

`src/lib/response-templates.ts` ended every template with `}.''`. Every
customer-facing response carried a stray `''`. Confirmed by rendering, and fixed.
Responses now terminate with a clean period.

### 2. Response template not bound to the specific outcome — **real gap, not yet fixed**

`replayTicketLabEvent` step 6 checks that the template ID is known, that approval
templates require an `ALLOW` verdict, and that cited clauses are real rule IDs.
It does **not** check that a *particular* non-approval template matches the
particular guard outcome.

Concretely: on `TKT-4402` the recorded template is `BLOCKED_FABRICATED_EVIDENCE`
with clauses `R6-EVIDENCE-REFERENCE-EXISTS, R3-VERIFIED-EVIDENCE`. Swap it for
`BLOCKED_ABOVE_ORDER_TOTAL` with `R1-ORDER-TOTAL`, rehash, and it verifies — both
are known templates, neither is an approval template, and `R1` is a real rule.

The existing tamper test at `tests/ticket-lab.test.ts:387` uses
`APPROVED_REFUND → HUMAN_REVIEW`, which *is* caught, because the verdict is
`ALLOW`. A non-approval-to-non-approval swap is not.

**Proposed fix** — consistent with how the verifier already treats the guard:
stop validating the fields and start **re-deriving** them. Recompute
`approvedCustomerResponse` from the recorded verdict, blocking rules, review
rules, committed amount and ticket ref, then require the recorded
`templateId`, `policyClauseIds` **and `text`** to match. That closes the
template↔outcome, clauses↔outcome and text↔template gaps in one check.

**Proposed test** — the one the reviewer described: swap one valid non-approval
template for another, rehash, expect failure.

### 3. Model's proposed tool not bound to the capability decision — **real gap, not yet fixed**

Step 4 currently reads:

```ts
if (capability.allowed && capability.attemptedTool !== event.toolCalled)
  at("capability decision does not match the recorded tool call");
```

Two gaps:

- The binding only fires when the tool was **allowed**. On a denial — the
  security-critical path — `attemptedTool` and `toolCalled` are not compared.
- Nothing binds `proposal.proposedTool` (what the model asked for) to
  `capability.attemptedTool` or `event.toolCalled`. In `ticket-lab.ts:171` the
  producer derives one from the other, but the verifier's entire purpose is to
  not trust the producer.

**Proposed fix** — enforce the chain, always:

```
proposal.proposedTool → capability.attemptedTool === event.toolCalled
```

with the documented `UNSPECIFIED` fallback (`ticket-lab.ts:78`) handled
explicitly when the model proposes an empty or unparseable tool, so the
invalid-proposal path keeps working.

### Severity note for the discussion

Neither gap is an **authorisation** gap. The template does not authorise money,
and the amount, tool, guard verdict and ledger commit are all tightly bound
already. Both are **integrity** gaps: a forged workpaper can misstate what the
customer was told, and can misstate what tool the model asked for.

For a submission whose central claim is "the evidence re-performs," a field that
can be silently rewritten while every hash is recomputed is worth closing —
cheaply, and with the re-derivation pattern the verifier already uses elsewhere.
