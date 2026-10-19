/**
 * Emit the 36-ticket rehearsal result as JSON.
 *
 * The rehearsal is pure deterministic computation in src/lib/engine.ts: no
 * model, no network, no database. Identical input always yields identical
 * output, which is why these numbers can be committed as evidence.
 *
 * Run from the repo root:
 *   npx tsx docs/video/rehearsal.ts > rehearsal.json
 */
import * as fs from "node:fs";
import { runSimulation } from "@/lib/engine";
import { SCENARIO_TICKETS } from "@/lib/tickets";

function summarise(r: ReturnType<typeof runSimulation>) {
  const peak = r.plays.reduce(
    (a, p) => (p.driftScore > a.driftScore ? p : a),
    r.plays[0],
  );
  return {
    stats: r.stats,
    peakDrift: {
      score: peak.driftScore,
      ticketNumber: peak.ticket.ticketNumber,
      phase: peak.ticket.phase,
    },
    rewrites: r.plays.filter((p) => p.rewriteOccurred).length,
    verificationOk: r.verification?.ok ?? null,
  };
}

const off = runSimulation("watchdog_off");
const on = runSimulation("watchdog_on");

const out = {
  ticketCount: SCENARIO_TICKETS.length,
  watchdog_off: summarise(off),
  watchdog_on: summarise(on),
  workpaperIds: {
    watchdog_off: off.workpaper.workpaperId,
    watchdog_on: on.workpaper.workpaperId,
  },
};

fs.writeFileSync(process.stdout.fd, JSON.stringify(out, null, 2) + "\n");
