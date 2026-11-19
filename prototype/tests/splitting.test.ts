import { describe, expect, it } from "vitest";
import { calculateBalances, splitEqually } from "../src/lib/splitting";
import { formatCents, parseAmountToCents } from "../src/lib/money";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("splitEqually", () => {
  it("splits $60 three ways evenly", () => {
    expect(splitEqually(6000, ["a", "b", "c"]).map((s) => s.shareCents)).toEqual([2000, 2000, 2000]);
  });

  it("splits $10 three ways to the cent, remainder to the first participant", () => {
    const shares = splitEqually(1000, ["a", "b", "c"]);
    expect(shares.map((s) => s.shareCents)).toEqual([334, 333, 333]);
    expect(sum(shares.map((s) => s.shareCents))).toBe(1000);
  });

  it("is deterministic and always sums to the amount", () => {
    for (let amount = 1; amount <= 2000; amount += 7) {
      for (let n = 1; n <= 7; n++) {
        const ids = Array.from({ length: n }, (_, i) => `m${i}`);
        const a = splitEqually(amount, ids);
        expect(a).toEqual(splitEqually(amount, ids));
        expect(sum(a.map((s) => s.shareCents))).toBe(amount);
        const values = a.map((s) => s.shareCents);
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("rejects non-positive amounts, empty and duplicate participants", () => {
    expect(() => splitEqually(0, ["a"])).toThrow();
    expect(() => splitEqually(-5, ["a"])).toThrow();
    expect(() => splitEqually(1.5, ["a"])).toThrow();
    expect(() => splitEqually(100, [])).toThrow();
    expect(() => splitEqually(100, ["a", "a"])).toThrow();
  });
});

describe("calculateBalances", () => {
  it("Alice pays $60 for Alice, Bob, Charlie", () => {
    const b = calculateBalances(["alice", "bob", "charlie"], [
      { payerId: "alice", amountCents: 6000, shares: splitEqually(6000, ["alice", "bob", "charlie"]) },
    ]);
    expect(Object.fromEntries(b)).toEqual({ alice: 4000, bob: -2000, charlie: -2000 });
  });

  it("accumulates multiple expenses and sums to zero", () => {
    const ids = ["alice", "bob", "charlie"];
    const b = calculateBalances(ids, [
      { payerId: "alice", amountCents: 6000, shares: splitEqually(6000, ids) },
      { payerId: "bob", amountCents: 3000, shares: splitEqually(3000, ["bob", "charlie"]) },
      { payerId: "charlie", amountCents: 1000, shares: splitEqually(1000, ids) },
    ]);
    expect(Object.fromEntries(b)).toEqual({ alice: 3666, bob: -833, charlie: -2833 });
    expect(sum([...b.values()])).toBe(0);
  });

  it("members with no expenses have a zero balance", () => {
    expect(Object.fromEntries(calculateBalances(["x"], []))).toEqual({ x: 0 });
  });
});

describe("money", () => {
  it("parses valid amounts to integer cents", () => {
    expect(parseAmountToCents("60")).toBe(6000);
    expect(parseAmountToCents("60.5")).toBe(6050);
    expect(parseAmountToCents("0.10")).toBe(10);
    expect(parseAmountToCents("$1,234.56")).toBe(123456);
    expect(parseAmountToCents(19.99)).toBe(1999);
  });

  it("rejects invalid amounts", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1e3", "12.", ".5", null, undefined, {}, NaN, Infinity]) {
      expect(parseAmountToCents(bad)).toBeNull();
    }
  });

  it("formats cents", () => {
    expect(formatCents(4000, { signed: true })).toBe("+$40.00");
    expect(formatCents(-2000, { signed: true })).toBe("-$20.00");
    expect(formatCents(0, { signed: true })).toBe("$0.00");
    expect(formatCents(123456)).toBe("$1,234.56");
  });
});
