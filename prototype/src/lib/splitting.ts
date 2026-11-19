/** Pure split / balance calculations. No I/O, so they are easy to unit-test. */

export interface Share {
  memberId: string;
  shareCents: number;
}

/**
 * Divides amountCents equally among participants.
 * Remainder cents are distributed deterministically: one extra cent to each
 * of the first (amount % n) participants, in the order given. Callers pass
 * participants in a stable order (member join order), so results are repeatable.
 * The shares always sum exactly to amountCents.
 */
export function splitEqually(amountCents: number, orderedParticipantIds: string[]): Share[] {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error("Amount must be a positive whole number of cents.");
  }
  const n = orderedParticipantIds.length;
  if (n === 0) throw new Error("At least one participant is required.");
  if (new Set(orderedParticipantIds).size !== n) throw new Error("Participants must be unique.");

  const base = Math.floor(amountCents / n);
  const remainder = amountCents % n;
  return orderedParticipantIds.map((memberId, i) => ({
    memberId,
    shareCents: base + (i < remainder ? 1 : 0),
  }));
}

export interface ExpenseForBalance {
  payerId: string;
  amountCents: number;
  shares: Share[];
}

/**
 * Net balance per member: total paid minus total owed.
 * Positive = should receive money; negative = owes money.
 * Since each expense's shares sum to its amount, balances always sum to zero.
 */
export function calculateBalances(memberIds: string[], expenses: ExpenseForBalance[]): Map<string, number> {
  const balances = new Map<string, number>(memberIds.map((id) => [id, 0]));
  const add = (id: string, delta: number) => balances.set(id, (balances.get(id) ?? 0) + delta);
  for (const e of expenses) {
    add(e.payerId, e.amountCents);
    for (const s of e.shares) add(s.memberId, -s.shareCents);
  }
  return balances;
}
