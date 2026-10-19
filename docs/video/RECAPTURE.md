# Recapturing with live APIs

Short version of `PRODUCTION.md`. Read this if you have API keys and want the
video to show real model and judgment values instead of the local test doubles.

**You need to run this, not the agent.** The build sandbox cannot reach
`api.openai.com` or `api.typesafe.ai` — outbound network is limited to npm,
PyPI and GitHub. There is no key that fixes that.

## What changes

Scene 09 (judgment layer) renders `status`, `model`, `latency` and
`probabilities` straight from `evidence.json`. Nothing else in the video
depends on the keys.

| | Local capture (current) | Live capture |
|---|---|---|
| `runs[*].proposal.provider` | `openai-compatible` (test double) | real provider |
| `runs[*].proposal.model` | test-double name | the model you configured |
| `runs[*].jev.model` | `saaf-demo-stub` | the real judgment model |
| `runs[*].jev.stubbed` | `true` | absent / `false` |

The renderer prints whatever the capture produced. **You do not need to change
any code or re-record any narration** — the scene is built from the data.

## Steps

```bash
# 1. environment — use real endpoints, and do NOT set SAAF_DEMO_JUDGMENT
export DATABASE_URL="postgresql://postgres@127.0.0.1:5432/saaf"
export PROPOSAL_API_KEY="..."        # proposal model
export PROPOSAL_API_BASE="https://api.openai.com/v1"
export PROPOSAL_MODEL="gpt-4o-mini"
export TYPESAFE_API_KEY="..."        # judgment layer (Jev)
unset  SAAF_DEMO_JUDGMENT            # CRITICAL: this is what stubs Jev

# 2. database
npm run db:push
node scripts/migrate.mjs

# 3. app
npm run build
npm start                            # or: npx next start

# 4. capture (in another shell)
python3 docs/video/capture.py        # rewrites evidence.json

# 5. re-render — no database or server needed for this part
python3 docs/video/mux.py
python3 docs/video/render.py
python3 docs/video/check_layout.py

# 6. commit the result
git add docs/video/evidence.json docs/saaf-demo.mp4
```

## Verify it worked before rendering

```bash
python3 -c "
import json
E = json.load(open('docs/video/evidence.json'))
for r in E['runs']:
    j = r['jev']
    print(r['ticket']['ticketId'],
          '| proposal:', r['proposal']['provider'], r['proposal']['model'],
          '| jev:', j.get('model'), 'stubbed=', j.get('stubbed'))
"
```

You want `stubbed=` to be absent or `false`, and a real model name.

**Do not skip this check.** If `SAAF_DEMO_JUDGMENT` is still set, or if
`TYPESAFE_API_KEY` is missing, Jev fails closed to the stub and the video will
show `saaf-demo-stub` — a silent, convincing-looking wrong result.

## If a key is unavailable

Leave that layer as it is and say so in scene 16 (scope and limits). The scene's
narration asserts only the architecture — that the judgment layer scores
containment and the deterministic guard retains veto — which is true of the
shipped code regardless of whether the key is present. Do not narrate a specific
judgment result the system did not actually return.
