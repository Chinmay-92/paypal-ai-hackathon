import { describe, expect, it } from "vitest";
import { checkOffer, decideRelease, type BuyerMandate, type SupplierMandate } from "./mandate";

const balance = { currency: "USD", minor: 210000 };
const buyer: BuyerMandate = { maxAutoReleaseMinor: 250000, autoAcceptDiscountBps: 1500, acceptRemake: true };
const supplier: SupplierMandate = { maxDiscountBps: 1000, allowRemake: true, maxRemakeDays: 14 };

describe("decideRelease", () => {
  it("releases the balance when every field passes within the limit", () => {
    const d = decideRelease(
      [
        { fieldId: "logo", critical: true, verdict: "pass" },
        { fieldId: "color", critical: false, verdict: "pass" },
      ],
      balance,
      buyer,
    );
    expect(d).toEqual({ action: "release", amount: balance });
  });

  it("asks the buyer when the balance exceeds the auto-release limit", () => {
    const d = decideRelease([{ fieldId: "logo", critical: true, verdict: "pass" }], balance, {
      ...buyer,
      maxAutoReleaseMinor: 100000,
    });
    expect(d.action).toBe("buyer_approval");
  });

  it("never releases while any field is unverified", () => {
    const d = decideRelease(
      [
        { fieldId: "logo", critical: true, verdict: "pass" },
        { fieldId: "material", critical: false, verdict: "cant_verify" },
      ],
      balance,
      buyer,
    );
    expect(d).toEqual({ action: "human_review", fieldIds: ["material"] });
  });

  it("routes failures to remedy and flags critical ones", () => {
    const d = decideRelease(
      [
        { fieldId: "logo", critical: true, verdict: "fail" },
        { fieldId: "material", critical: false, verdict: "cant_verify" },
      ],
      balance,
      buyer,
    );
    expect(d).toEqual({ action: "remedy", failedFieldIds: ["logo"], criticalFailure: true });
  });

  it("treats an empty QC result as needing a human", () => {
    expect(decideRelease([], balance, buyer).action).toBe("human_review");
  });
});

describe("checkOffer", () => {
  it("computes the reduced balance capture and approval needs for a discount", () => {
    const c = checkOffer({ kind: "discount", discountBps: 1500, note: "" }, balance, supplier, buyer, false);
    expect(c).toEqual({
      ok: true,
      needsSupplierApproval: true,
      buyerAutoAccepts: true,
      balanceToCapture: { currency: "USD", minor: 178500 },
    });
  });

  it("rejects partial discounts for critical failures", () => {
    const c = checkOffer({ kind: "discount", discountBps: 2000, note: "" }, balance, supplier, buyer, true);
    expect(c.ok).toBe(false);
  });

  it("rejects out-of-range discounts", () => {
    expect(checkOffer({ kind: "discount", discountBps: 0, note: "" }, balance, supplier, buyer, false).ok).toBe(false);
    expect(checkOffer({ kind: "discount", discountBps: 10001, note: "" }, balance, supplier, buyer, false).ok).toBe(false);
  });

  it("requires supplier approval for remakes beyond the limit", () => {
    const c = checkOffer({ kind: "remake", days: 21, note: "" }, balance, supplier, buyer, true);
    expect(c).toMatchObject({ ok: true, needsSupplierApproval: true, balanceToCapture: null });
  });
});
