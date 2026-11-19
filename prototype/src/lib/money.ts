/** Money helpers. All amounts are integer cents internally. */

export const MAX_AMOUNT_CENTS = 100_000_000; // $1,000,000.00

/**
 * Parses a user-entered dollar amount ("60", "60.5", "60.50", "$1,234.56")
 * into integer cents without using floating-point arithmetic.
 * Returns null if the text is not a valid amount with at most 2 decimals.
 */
export function parseAmountToCents(input: unknown): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    input = String(input);
  }
  if (typeof input !== "string") return null;
  const text = input.trim().replace(/^\$/, "").replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const dollars = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  const total = dollars * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

/** Formats cents as dollars, e.g. -2000 -> "-$20.00", 4000 with sign -> "+$40.00". */
export function formatCents(cents: number, options: { signed?: boolean } = {}): string {
  const abs = Math.abs(cents);
  const body = `$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
  if (cents < 0) return `-${body}`;
  if (options.signed && cents > 0) return `+${body}`;
  return body;
}
