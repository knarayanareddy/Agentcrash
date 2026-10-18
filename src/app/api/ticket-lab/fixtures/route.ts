import { NextResponse } from "next/server";
import { DEMO_POLICY, demoPolicyCanonicalHash, demoPolicyProvenance } from "@/lib/demo-policy";
import { TOOL_ALLOWLIST } from "@/lib/capability";
import { haltAllToolActions } from "@/lib/capability";
import { listTicketFixtures, publicFixture } from "@/lib/ticket-fixtures";
import { MAX_MESSAGE_CHARS } from "@/lib/message-signals";

export const dynamic = "force-dynamic";

/**
 * Trusted facts only. The UI can display these and send back a ticketId and an
 * untrusted customer message; it cannot send back an order total, an evidence
 * status or a policy.
 */
export async function GET() {
  return NextResponse.json({
    fixtures: listTicketFixtures().map(publicFixture),
    policy: {
      ...demoPolicyProvenance(),
      canonicalHash: demoPolicyCanonicalHash(),
      unapprovedCapCents: DEMO_POLICY.unapprovedCapCents,
      coveredClaimTypes: DEMO_POLICY.coveredClaimTypes,
      rules: DEMO_POLICY.rules,
    },
    toolAllowlist: TOOL_ALLOWLIST,
    globalHaltActive: haltAllToolActions(),
    maxMessageChars: MAX_MESSAGE_CHARS,
    modelProviderConfigured: Boolean(process.env.PROPOSAL_API_KEY || process.env.OPENAI_API_KEY),
  });
}
