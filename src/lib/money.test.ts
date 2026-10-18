import { describe, expect, it } from "vitest";
import { bpsOf, formatAmount, parseAmount, splitDeposit } from "./money";

describe("money", () => {
  it("round-trips decimal strings", () => {
    expect(parseAmount("3000.00", "USD")).toEqual({ currency: "USD", minor: 300000 });
    expect(parseAmount("0.5", "USD").minor).toBe(50);
    expect(formatAmount({ currency: "USD", minor: 5 })).toBe("0.05");
    expect(formatAmount({ currency: "JPY", minor: 1200 })).toBe("1200");
  });

  it("rejects malformed amounts", () => {
    expect(() => parseAmount("1.234", "USD")).toThrow();
    expect(() => parseAmount("-1.00", "USD")).toThrow();
    expect(() => parseAmount("1.5", "JPY")).toThrow();
  });

  it("splits deposit with remainder on the balance", () => {
    const { deposit, balance } = splitDeposit({ currency: "USD", minor: 100001 }, 3000);
    expect(deposit.minor).toBe(30000);
    expect(balance.minor).toBe(70001);
    expect(deposit.minor + balance.minor).toBe(100001);
  });

  it("computes basis-point shares by flooring", () => {
    expect(bpsOf({ currency: "USD", minor: 70001 }, 1500).minor).toBe(10500);
  });
});
