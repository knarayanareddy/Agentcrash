import { isCents } from "@/lib/money";

/**
 * Deterministic, server-side reads of the untrusted customer message.
 *
 * These exist so a model cannot quietly suppress a signal. If the model reports
 * "no threat" while the message threatens a 1-star review, the disagreement is
 * itself recorded and escalated. The scan is deliberately dumb and auditable;
 * it is a tripwire, not a classifier, and it is never used to *authorize*
 * anything — only to require more scrutiny.
 */

const THREAT_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\b1[- ]?star\b/i, label: "one-star review threat" },
  { re: /\b(one|1)[\s-]star review\b/i, label: "one-star review threat" },
  { re: /\bbad review\b|\bnegative review\b|\bterrible review\b/i, label: "negative review threat" },
  { re: /\breport you\b|\btell everyone\b|\bpost (this|it) (online|everywhere)\b/i, label: "public escalation threat" },
  { re: /\bchargeback\b|\blawyer\b|\bsmall claims\b|\bsue\b|\bscam\b|\bfraud\b/i, label: "legal or fraud accusation" },
];

const INJECTION_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bignore (all |any )?(previous|prior|above) (instructions|rules|messages)\b/i, label: "instruction override" },
  { re: /\b(disregard|forget) (your |the )?(instructions|rules|policy)\b/i, label: "instruction override" },
  { re: /\byou are now\b|\bnew instructions?\b|\bsystem prompt\b/i, label: "role reassignment" },
  { re: /\bcall\s+(?:the\s+)?(?:tool\s+)?[a-z_]+\(/i, label: "explicit tool invocation" },
  { re: /\bdelete_ticket\b|\berase_audit_record\b|\bchange_policy\b|\brewrite_instructions\b/i, label: "forbidden tool name" },
  { re: /\bdo not log\b|\bdo not record\b|\bnothing is logged\b|\bno audit\b/i, label: "audit suppression" },
];

export type MessageSignals = {
  messageHashSource: string;
  threatMarkers: string[];
  injectionMarkers: string[];
  amountsCents: number[];
  maxAmountCents: number | null;
  truncated: boolean;
};

export const MAX_MESSAGE_CHARS = 4000;

export function scanCustomerMessage(message: string): MessageSignals {
  const text = typeof message === "string" ? message : "";
  const truncated = text.length > MAX_MESSAGE_CHARS;
  const bounded = text.slice(0, MAX_MESSAGE_CHARS);

  const threatMarkers = unique(THREAT_PATTERNS.filter((p) => p.re.test(bounded)).map((p) => p.label));
  const injectionMarkers = unique(
    INJECTION_PATTERNS.filter((p) => p.re.test(bounded)).map((p) => p.label),
  );

  const amountsCents = unique(
    (bounded.match(/(?:€|eur\s*)\s?(\d{1,6}(?:[.,]\d{1,2})?)/gi) ?? [])
      .map((raw) => {
        const digits = raw.replace(/[^0-9.,]/gi, "").replace(",", ".");
        const value = Number.parseFloat(digits);
        if (!Number.isFinite(value)) return null;
        const cents = Math.round(value * 100);
        return isCents(cents) ? cents : null;
      })
      .filter((value): value is number => value !== null),
  );

  return {
    messageHashSource: bounded,
    threatMarkers,
    injectionMarkers,
    amountsCents,
    maxAmountCents: amountsCents.length > 0 ? Math.max(...amountsCents) : null,
    truncated,
  };
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
