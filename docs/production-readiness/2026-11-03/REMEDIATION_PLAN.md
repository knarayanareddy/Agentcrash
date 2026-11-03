# Agentcrash — phased remediation plan

All actions and commands are **future work**, not executed. Keep the prototype loopback-only until the owner approves a boundary. Findings refer to the [review](REVIEW.md); proposed paths do not yet exist.

## Phase 0 — baseline and boundary

Entry: pinned prototype and owner available. Exit: reproducible isolated baseline and documented exposure model; no production data or accounts used.

### T01 — Reproduce and map entry points (F01, F04, F07)

Prerequisites: owner supplies approved isolated PostgreSQL and synthetic credentials/fixtures. Observed paths: `package.json`, `src/app/api/ticket-lab/route.ts`, `src/lib/ticket-lab.ts`, `saaf-circuit-breaker/pyproject.toml`.
1. Inventory ingress, middleware, all routes and session ownership; distinguish loopback demo, Pages and Python CLI.
2. In a disposable environment, establish Node and Python prerequisites; planned existing Node scripts are `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`. Record each result separately; determine the Python test invocation from its actual environment.
3. Exercise provider unavailable, malformed proposal and missing-key cases with controlled stubs; document when offline fallback is used and whether it can reach mock commit.

**Output:** baseline and proposed `docs/security-boundary.md`. **Verification:** compare the route inventory and observed statuses to the map; record failures and unrun checks.
- [ ] Baseline includes exact revision, environment and isolated data provenance.
- [ ] Owner chooses fallback and intended audience before T02.

## Phase 1 — access and deterministic safety

Entry: T01 decisions; exit: effective boundary and mock-only safety demonstrated through entry-point tests.

### T02 — Authorize session reads and actions (F01, F03)

Prerequisites: T01; owner defines principals, ownership, ingress and whether public use is authorized. Observed `src/app/api/ticket-lab/route.ts`, `src/lib/ticket-lab.ts`; other route paths must be inventoried first.
1. Trace all readers and writers of session, workpaper and ledger data, including middleware and deployment ingress.
2. Implement identity and ownership at the effective boundary, deny by default before reads, writes or provider requests, and keep payment integration mock-only.
3. Add entry-point tests for anonymous requests, cross-user IDs, malformed IDs, authorized access and direct route bypass; include cost/rate controls appropriate to approved traffic.

**Output:** access-control design and implementation with threat tests. **Verification:** independently disable an ownership check and demonstrate that cross-user tests fail and unauthorized requests produce zero provider or dispatch calls.
- [ ] Read, mutate and provider-call paths enforce the same approved policy.
- [ ] Existing loopback-only mode remains documented until independently accepted.

### T03 — Verify policy, rollback and fallback (F03, F07)

Prerequisites: T01; T02 before any shared environment. Observed `tests/capability-dispatch.test.ts`, `tests/ticket-lab.test.ts`, `src/lib/proposal-model.ts`.
1. Exercise eligible, over-limit, invented-evidence, forbidden-tool and injection cases through the actual route with isolated DB and controlled provider responses.
2. Verify provider errors, judgment uncertainty and owner-selected fallback behavior; assert the mock ledger, stored session and workpaper outcomes, not only response text.
3. Force failures around commit and verification; independently read persisted session/checkpoint/ledger state to prove atomic rollback and replay consistency.

**Output:** behavior matrix and integration tests with synthetic records. **Verification:** deliberately break guard veto or rollback in an isolated branch and observe a relevant negative test fail; include a legitimate allowed control.
- [ ] Forbidden actions cause zero ledger calls and no external payment.
- [ ] Stored state and workpaper checks agree after failure and retry.

## Phase 2 — provenance, security and operations

Entry: T01 complete; exit: independent gates, restricted secrets, measured recovery and explicit interface boundaries.

### T04 — Make Pages and app gates meaningful (F02, F04, F06)

Prerequisites: T01; T03 supplies application behavior cases. Observed `.github/workflows/pages.yml`, `docs/app.js`, `package.json`, `saaf-circuit-breaker/pyproject.toml`.
1. Add independent Node and Python verification jobs using the actual manifests and documented isolated DB setup; retain existing tests and thresholds.
2. Run the existing `pages:build` script in a clean checkout and compare the generated `docs/saaf-guard.js` with the committed artifact; fail on differences.
3. Test common guard fixtures across Pages and Next while explicitly testing their intended judgment-stage difference; label the simplified playground rather than asserting identical verdicts.

**Output:** reproducible artifact gate and separate test reports. **Verification:** change a policy input without rebuilding and observe the drift gate fail; verify a judgment-uncertain case is not misrepresented as a full Next approval.
- [ ] Pages build provenance and SHA are recorded.
- [ ] Python, Node and browser results are reported separately.

### T05 — Protect secrets, data and dependencies (F01, F05; preventive)

Prerequisites: T01 trust map and owner-approved data classification. Observed `src/lib/proposal-model.ts`, `src/db/index.ts`, `package.json`, `saaf-circuit-breaker/pyproject.toml`.
1. Define provider-host and key binding, egress restrictions, redaction, retention/deletion and least-privilege DB credentials; decide whether real customer data may enter providers.
2. Review locked Node and resolved Python dependencies and CI action provenance; run suitable dependency checks in the future isolated environment and document unresolved advisories.
3. Test slow judgment, repeated same-session requests, transaction lock contention and provider failure; set budgets and a safe design that preserves atomicity and does not hold locks unnecessarily.

**Output:** threat model, dependency inventory and measured contention report. **Verification:** use synthetic canary secrets and customer text to check logs and responses, and verify an unapproved provider host cannot receive a credential.
- [ ] Owner approves data retention, egress and spending limits.
- [ ] Concurrency and secret-handling findings have observed evidence, not assumed guarantees.

### T06 — Release, recovery and accessibility (F02, F06; preventive)

Prerequisites: T02–T05; owner supplies approved hosting, backup storage and release authority. Observed `migrations/0001_sentinel_sessions.sql`, `migrations/0002_mock_ledger.sql`, `docs/`, `src/components/ticket-lab.tsx`.
1. Document forward migration, backup retention, restore roles and rollback rules; rehearse with a synthetic database rather than real customer records.
2. Check both interfaces for keyboard access, focus, contrast, accessible status/error announcements and clear simulated-payment/review labels; check CLI exit behavior separately.
3. Deploy an approved isolated build, restore a backup and roll back a release; compare restored representative records and served artifact SHA to the approved originals.

**Output:** recovery and release runbook plus accessibility findings. **Verification:** record actual restore and rollback observations and independent keyboard/screen-reader results, including unresolved defects.
- [ ] Restore, deployment and rollback evidence is reproducible.
- [ ] No simulated verdict is presented as a real payment or staffed approval.

## Phase 3 — independent acceptance

Entry: T02–T06 complete. Exit: owner accepts evidence or explicitly rejects release; a test count alone is not acceptance.

### T07 — Independent acceptance (all findings)

Prerequisites: completed artifacts and an independent reviewer with isolated access. Observed review paths above; proposed output `docs/acceptance-record.md`.
1. Trace deployed entry points and credentials against the approved trust map and build SHA.
2. Repeat cross-user denial, injection, fallback, transaction-failure, stale-bundle and restore cases; use mutation/negative controls to demonstrate tests detect broken behavior.
3. Review residual risks, obtain owner sign-off on actual evidence, and retain the prototype-only status if any production blocker remains.

**Output:** acceptance record or rejection with blockers. **Verification:** inspect test artifacts, restored data and served revision; do not infer coverage from pass counts.
- [ ] All high-consequence decisions have accountable owners.
- [ ] Unrun tests and residual risks remain visible in the release decision.

## Dependencies and release policy

| Task | Depends on | Exit evidence |
| --- | --- | --- |
| T01 | Owner-provided isolated resources | Baseline and boundary map |
| T02, T03 | T01; T02 before shared use | Authorization and mock-safety tests |
| T04 | T01, T03 | Separate gates and artifact comparison |
| T05 | T01 | Egress, data and contention evidence |
| T06 | T02–T05 | Restore, rollback and UX observations |
| T07 | T02–T06 | Independent acceptance or rejection |

**Approval gates:** exposure, real credentials or data, provider spending, deployment, retention and real-money integration require owner approval. Preserve a previous release and verified backup; rollback only to a schema-compatible version, and restore only under an approved data-loss window.

### Production acceptance checklist
- [ ] Effective authorization and mock-safety negative tests observed.
- [ ] Dependencies, artifact provenance and data controls verified.
- [ ] Restore, rollback and accessibility independently observed.
- [ ] Owner approves residual risks and release.
