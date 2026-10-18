/**
 * Money is represented as integer minor units (cents) end-to-end: model output,
 * policy guard, mock ledger and workpaper. Euros exist only for display.
 */

export function isCents(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 100_000_000
  );
}

export function eurToCents(eur: number): number {
  if (typeof eur !== "number" || !Number.isFinite(eur)) {
    throw new TypeError("EUR value must be finite");
  }
  const cents = Math.round(eur * 100);
  if (Math.abs(eur * 100 - cents) > 1e-7) {
    throw new TypeError("EUR value has sub-cent precision");
  }
  return cents;
}

export function centsToEur(cents: number): number {
  if (!isCents(cents)) throw new TypeError("Not a valid cent amount");
  return cents / 100;
}

export function formatEur(cents: number): string {
  if (!isCents(cents)) return "n/a";
  return `€${(cents / 100).toFixed(2)}`;
}
