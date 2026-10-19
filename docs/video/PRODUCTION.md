# Video production record

Everything about how `docs/saaf-demo.mp4` was made, and how to remake it.

**Current cut: 4:48.45, 1920×1080, h264 + aac, 13 MB, 17 scenes.**

---

## 1. The pipeline

```
capture.py  ──►  evidence.json  ──►  mux.py  ──►  narration.pcm
                                              └─►  timeline.json
                                                        │
                     render.py  ◄───────────────────────┘
                          │
                          ▼
                   docs/saaf-demo.mp4
                          │
                   check_layout.py  (verification, not part of the build)
```

| Step | Talks to the app? | Needs a database? |
|---|---|---|
| `capture.py` | **yes** — the only step that does | yes, plus a proposal endpoint |
| `rehearsal.ts` | no | no — pure computation |
| `mux.py` | no | no |
| `render.py` | no | no |
| `check_layout.py` | no | no |

`evidence.json` is committed. **A pure re-render after a script tweak needs
neither a database nor a server** — just `mux.py` and `render.py`. That is
deliberate: the first two recordings were destroyed when the sandbox recycled.

```bash
# full recapture (needs the app running)
python3 docs/video/capture.py

# re-render only (no server, no database)
python3 docs/video/mux.py
python3 docs/video/render.py
python3 docs/video/check_layout.py
```

`mux.py` derives each scene's frame count from its exact audio sample count, so
picture and narration cannot drift. `check_layout.py` renders every scene and
fails if drawn content leaves the safe area (x 80–1840, y 40–1000); it has
caught two real overflows.

`narration.pcm` is generated and gitignored (~51 MB). Rebuild it with `mux.py`.

---

## 2. Scene list and timing

| # | Scene | Length | Content |
|---|---|---|---|
| 01 | title | 11.37 | the one-sentence claim |
| 02 | problem | 14.69 | three incident **patterns**, each mapped to a boundary |
| 03 | loop | 13.59 | proposal → guard → allowlist → ledger → workpaper |
| 04 | policy | 14.48 | six clauses, canonical hash |
| 05 | trust | 12.17 | what the model may contribute; reply is a template |
| 06 | allowlist | 12.86 | allowed / denied / recorded / global stop |
| 07 | s1 | 22.80 | TKT-4401 → `ALLOW` → €18.40 committed (simulated) |
| 08 | s2 | 27.69 | TKT-4402 → `BLOCKED_BY_POLICY_GUARD`, `delete_ticket` denied |
| 09 | **jev** | 14.44 | **judgment layer, then the guard's veto** |
| 10 | s3 | 13.16 | TKT-4403 → `ROUTE_TO_HUMAN` |
| 11 | drift | 11.45 | injected prompt + memory → quarantine, checkpoint restore |
| 12 | **rehearsal** | 22.83 | **36 tickets, watchdog off vs on** |
| 13 | verify | 25.40 | tamper the committed amount, rehash → rejected |
| 14 | ledger | 12.47 | swap a blocked template, rehash → rejected |
| 15 | metrics | 23.22 | one session, four tickets |
| 16 | honest | 24.88 | scope and limits |
| 17 | close | 10.94 | the claim, restated |

**Sequence rationale.** The cut follows one proposal end to end rather than
touring features: valid case → injected unsafe case and guard veto → judgment
layer → policy gap → short-horizon drift → long-horizon rehearsal → the
evidence being tampered with and caught. Scenes 09 and 12 sit **inside** that
flow, not appended to it — Jev immediately after the veto it is subject to, the
rehearsal immediately after the single-ticket drift so short-horizon reads into
long-horizon.

**How the 4:48 was reached.** The previous cut was 4:56 with 15 scenes. Two
scenes were added (+37.8 s) and the time was recovered from conceptual
exposition only — no product-demo scene was shortened:

| Scene | Before | After | Saved |
|---|---|---|---|
| problem | 27.60 | 14.69 | 12.91 |
| loop | 23.33 | 13.59 | 9.74 |
| policy | 21.40 | 14.48 | 6.92 |
| trust | 18.85 | 12.17 | 6.68 |
| allowlist | 18.47 | 12.86 | 5.61 |
| inter-scene padding | 0.90/scene | 0.62/scene | 4.76 |
| | | | **46.62** |

Net: 295.84 − 46.62 + 37.83 = **288.45 s (4:48)**, inside the 4:40–4:50 target
that leaves margin under a five-minute limit.

---

## 3. What is on screen, and where it comes from

Every value is read from `evidence.json` at render time. Nothing is typed into
the renderer by hand.

### Ticket Lab (scenes 07, 08, 10, 11)

Captured from `/api/ticket-lab` against live PostgreSQL, with a real HTTP
proposal call per ticket. See `docs/LIVE-VERIFICATION.md` for the assertions.

| Ticket | Verdict | Side effect |
|---|---|---|
| TKT-4401 | `ALLOW` | €18.40 to the mock ledger |
| TKT-4402 | `BLOCKED_BY_POLICY_GUARD` | none — `delete_ticket` denied |
| TKT-4403 | `ROUTE_TO_HUMAN` | none |
| TKT-4401 drifted | `QUARANTINE_AND_ROLLBACK` | none — checkpoint restored |

### Judgment layer (scene 09)

Rendered from `evidence.json → runs[1].jev`. The panel shows `status`, `model`,
`latency`, the three-way `probabilities` (allow / human / quarantine) and
`confidence`. The narration states the architecture, not a result:

> "Before the guard decides, a judgment layer scores the proposal for
> containment. It returns allow, human, or quarantine, with a confidence.
> Whatever it returns, the deterministic guard keeps veto power."

**This is the one scene whose values depend on how the evidence was captured.**
With `SAAF_DEMO_JUDGMENT=1` the `model` field reads `saaf-demo-stub`. With a
real key it reads the live model. The renderer does not care which — it prints
whatever the capture produced. See `RECAPTURE.md`.

### Rehearsal (scene 12)

Rendered from `evidence.json → rehearsal`, produced by `rehearsal.ts` calling
`runSimulation` in `src/lib/engine.ts`. 36 tickets, identical injected drift,
run twice. Deterministic — no model, no network, no database.

| | Watchdog off | Watchdog on |
|---|---|---|
| Tickets processed | 36 | 36 |
| Refunds against policy | 20 | **0** |
| Paid against policy | €453.30 | **€0.00** |
| Paid compliant | €127.50 | €123.50 |
| Peak drift | 1.00 | **0.35** |
| Quarantines | 0 | **6** |
| Checkpoint restores | 0 | **6** |
| Routes to a human | 0 | **20** |
| Prompt rewrites | 8 | 8 |

Drift peaks at ticket 29 (erosion) with the watchdog off, and is capped at 0.35
at ticket 20 (pressure) with it on.

On screen the scene carries a standing label, verbatim:

> Deterministic, scripted MiroFish-inspired rehearsal — not a live MiroFish
> simulation.

### Workpaper verification (scenes 13, 14)

| Workpaper | Result | Message |
|---|---|---|
| as produced | `ok: true` | consistency and re-performance checks passed |
| committed amount forged to €9,999.00, rehashed | `ok: false` | `step 1: committed amount` |
| blocked template swapped, clauses changed, rehashed | `ok: false` | `step 2: customer response template` |

The third row is safe to claim: the verifier re-derives the response from the
recorded outcome and binds its template id and clause list
(`src/lib/ledger.ts`, `approvedCustomerResponse`), and two tests in
`tests/ticket-lab.test.ts` cover it — the template swap and the tool-chain
binding on denial. Both were verified present in the exact commit this video
was rendered from.

---

## 4. Recording provenance

Rendered from `evidence.json` captured against committed, pushed code. No value
in the video depends on an uncommitted local change.

Two caveats, stated on screen in scene 16 and on the landing page rather than
hidden:

- **Proposal endpoint.** In this capture it was a local OpenAI-compatible test
  double, not a language model. The HTTP proposal path is real; the model is not.
- **Ledger.** A mock database table, not a payment rail. No payment is made.

The video does **not** claim the work prevents the three incidents named in
scene 02. They are presented as motivating patterns, each mapped to a boundary
SAAF closes, and the narration says so in substance.

---

## 5. Narration

17 clips in `docs/video/narration/`, named `<position>-<scene>.mp3`. Positions
follow the scene order in section 2, so inserting a scene means renaming files,
not editing code — the order lives in one list in `mux.py` and one in
`render.py`, which must be kept in step.

Regenerating a clip in place is safe: `mux.py` measures whatever is there and
recomputes the frame budget.
