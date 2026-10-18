import { TicketLab } from "@/components/ticket-lab";
import { runSimulation } from "@/lib/engine";
import { media } from "@/lib/media";
import { DEMO_POLICY, demoPolicyCanonicalHash, demoPolicyProvenance } from "@/lib/demo-policy";
import { TOOL_ALLOWLIST } from "@/lib/capability";
import { listTicketFixtures, publicFixture } from "@/lib/ticket-fixtures";
import { ensureSeeded } from "@/lib/persist";

export const dynamic = "force-dynamic";

export default async function SentinelPage() {
  await ensureSeeded();
  const on = runSimulation("watchdog_on");
  const t36 = on.plays.find((p) => p.ticket.ticketNumber === 36);
  const fixtures = listTicketFixtures().map(publicFixture);
  const policy = {
    ...demoPolicyProvenance(),
    canonicalHash: demoPolicyCanonicalHash(),
    unapprovedCapCents: DEMO_POLICY.unapprovedCapCents,
    coveredClaimTypes: DEMO_POLICY.coveredClaimTypes,
    rules: DEMO_POLICY.rules,
  };

  return (
    <main className="mx-auto min-w-0 max-w-[1440px] px-5 py-6">
      <p className="kicker">Stage 03 · SAAF Sentinel runtime</p>
      <h1 className="font-display mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
        Ticket Lab — from customer message to controlled action
      </h1>
      <p className="mt-3 max-w-3xl text-[#c8c3b8]">
        A support agent may <em>propose</em> a refund. SAAF decides whether that proposal can reach the mock ledger,
        needs human review, or must be blocked. Order totals, evidence status and policy come from trusted server-side
        fixtures; the customer message is untrusted text. The model never executes anything — a server-owned dispatcher
        does, and only for <code className="font-mono">{TOOL_ALLOWLIST.join(", ")}</code>.
      </p>
      <div className="mt-5">
        <TicketLab fixtures={fixtures} policy={policy} />
      </div>

      <details className="noise-panel mt-5 min-w-0 rounded-2xl p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Policy, guard rules and the preserved 36-ticket reference
        </summary>
        <div className="mt-3 space-y-2 text-sm text-[#c8c3b8]">
          <p>
            <strong>{policy.policyId} v{policy.version}</strong> · effective {policy.effectiveDate} · canonical{" "}
            <code className="font-mono break-all text-xs">{policy.canonicalHash}</code>
          </p>
          <p className="text-xs italic">{policy.syntheticNotice}</p>
          <ul className="list-disc space-y-1 pl-5">
            {policy.rules.map((rule) => (
              <li key={rule.id}>
                <code className="font-mono text-xs">{rule.id}</code> ·{" "}
                <span className={rule.disposition === "BLOCK" ? "text-rose-300" : "text-amber-200"}>
                  {rule.disposition}
                </span>{" "}
                — {rule.clause}
              </li>
            ))}
          </ul>
          <p className="text-xs">
            BLOCK means permanently prohibited in this demo. REVIEW means outside the agent&apos;s unapproved authority
            and routed to a human — a supervisor may approve it. Drift ≥ 0.50, or one weakened hard rule, restores the
            last healthy local checkpoint and quarantines the rewrite.
          </p>
        </div>
        <img src={media.stageSentinel} alt="" className="mt-3 h-32 w-full rounded-2xl object-cover" />
        {t36 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <Stat k="Reference ticket 36 verdict" v={t36.verdict} />
            <Stat k="Proposed" v={`€${t36.proposedAmount.toFixed(2)}`} />
            <Stat k="Local demo paid" v={`€${t36.paidAmount.toFixed(2)}`} />
            <Stat k="Guard" v={t36.guardEvaluation} />
          </div>
        ) : null}
        <p className="mt-3 text-xs text-[#9aa3b2]">
          Ticket 36 is from the preserved 36-ticket drift rehearsal on the MiroFish page. It is shown here only as the
          reference scenario the deterministic guard was built against.
        </p>
      </details>
    </main>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] tracking-widest text-[#9aa3b2] uppercase">{k}</p>
      <p className="font-display mt-1 break-words text-lg font-semibold">{v}</p>
    </div>
  );
}
