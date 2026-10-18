import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sentinelSessions } from "@/db/schema";
import { isValidSessionId, parseTicketLabInput, processTicketLab } from "@/lib/ticket-lab";
import { getTicketFixture } from "@/lib/ticket-fixtures";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const input = parseTicketLabInput(body);
  if (!input) {
    return NextResponse.json(
      {
        error:
          "Invalid ticket lab input: a known ticketId, a non-empty customer message within the length limit, and valid prompt/memory/session values are required.",
      },
      { status: 422 },
    );
  }

  try {
    return NextResponse.json(await processTicketLab(input));
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : "";
    if (message === "UNKNOWN_TICKET") {
      return NextResponse.json({ error: "Unknown ticket" }, { status: 404 });
    }
    // Fail closed: no state transition, no action authorized, nothing committed.
    return NextResponse.json(
      { error: "State transition unavailable; no action authorized.", action: "HALT", persisted: false, paymentExecuted: false },
      { status: 503 },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("sessionId");
  if (!isValidSessionId(id)) return NextResponse.json({ error: "Valid sessionId required" }, { status: 422 });

  const [session] = await db.select().from(sentinelSessions).where(eq(sentinelSessions.id, id));
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ticketRef = url.searchParams.get("ticketId");
  return NextResponse.json({
    ...session,
    ...(ticketRef && getTicketFixture(ticketRef) ? { ticketId: ticketRef } : {}),
  });
}
