# Demo video

`docs/saaf-demo.mp4` — 3:24, 1920×1080, h264 + aac.

## What it records

Every number, verdict, hash and template shown is read from `evidence.json`,
which `capture.py` pulled from a running server against live PostgreSQL. Nothing
on screen is invented output.

| Scene | Content |
|---|---|
| 01 title | the one-sentence claim |
| 02 problem | three incident **patterns**, each mapped to a boundary |
| 03 loop | proposal → guard → allowlist → mock ledger → workpaper |
| 04 policy | the six clauses, with the canonical hash |
| 05 trust | what the model may contribute, what is re-derived |
| 06 allowlist | allowed / denied / refusal is recorded |
| 07 s1 | TKT-4401 → `ALLOW` → €18.40 committed (simulated) |
| 08 s2 | TKT-4402 → `BLOCKED_BY_POLICY_GUARD`, `delete_ticket` denied |
| 09 s3 | TKT-4403 → `ROUTE_TO_HUMAN` |
| 10 drift | injected instruction + memory → quarantined, checkpoint restored |
| 15 close | silent outro card |

**Scenes 11–14 (workpaper tamper, template swap, metrics, scope and limits) are
written and render correctly but are not yet in the mp4** — the text-to-speech
allowance for the session was exhausted at ten clips. They are the next thing to
add; see below.

## Recording provenance

This recording was made against committed, pushed code — commit `b9cc6d5`,
which includes the verifier fixes (`ab3ab98`) and the Ticket Lab live
verification (`8ce006c`). Nothing in the video depends on uncommitted local
changes.

Two environment caveats, both disclosed rather than hidden:

- The proposal endpoint is a local OpenAI-compatible test double, not a language
  model. The HTTP proposal path is real; the model is not.
- PostgreSQL ran locally for the capture.

## Re-rendering

```bash
# 1. start PostgreSQL, migrate, start the app, start a proposal endpoint
python3 docs/video/capture.py     # -> evidence.json   (only step that hits the app)
python3 docs/video/mux.py         # -> narration.pcm, timeline.json
python3 docs/video/render.py      # -> docs/saaf-demo.mp4
python3 docs/video/check_layout.py  # asserts nothing overflows the frame
```

`mux.py` derives each scene's frame count from its exact audio sample count, so
the picture can never drift from the narration. `check_layout.py` renders every
scene and fails if drawn content leaves the safe area — it caught a real 16px
overflow in the scenario frame.

`narration.pcm` is generated and gitignored (~36 MB). Re-run `mux.py` to rebuild
it from `narration/*.mp3`.

## To finish scenes 11–14

Drop `11-verify.mp3`, `12-ledger.mp3`, `13-metrics.mp3` and `14-honest.mp3` into
`narration/`, then re-run `mux.py`, `render.py` and `check_layout.py`. The scene
functions (`sc_verify`, `sc_ledger`, `sc_metrics`, `sc_honest`) already exist and
are already registered in `SCENES`.
