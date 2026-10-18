// Money is always held as integer minor units (cents) to avoid float drift.
// PayPal's API takes decimal strings; conversion happens only at the boundary.

export type Money = { currency: string; minor: number };

const MINOR_DIGITS: Record<string, number> = { JPY: 0, HUF: 0, TWD: 0 };

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency] ?? 2;
}

export function parseAmount(value: string, currency: string): Money {
  const digits = minorDigits(currency);
  const pattern = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`);
  if (!pattern.test(value)) throw new Error(`Invalid ${currency} amount: ${value}`);
  const [whole, frac = ""] = value.split(".");
  const minor = Number(whole) * 10 ** digits + Number(frac.padEnd(digits, "0") || "0");
  if (!Number.isSafeInteger(minor)) throw new Error(`Amount out of range: ${value}`);
  return { currency, minor };
}

export function formatAmount(money: Money): string {
  const digits = minorDigits(money.currency);
  if (!Number.isSafeInteger(money.minor) || money.minor < 0) {
    throw new Error(`Invalid minor amount: ${money.minor}`);
  }
  if (digits === 0) return String(money.minor);
  const s = String(money.minor).padStart(digits + 1, "0");
  return `${s.slice(0, -digits)}.${s.slice(-digits)}`;
}

/** Splits a total into deposit and balance; rounding remainder goes to the balance. */
export function splitDeposit(total: Money, depositBps: number): { deposit: Money; balance: Money } {
  if (!Number.isInteger(depositBps) || depositBps <= 0 || depositBps >= 10_000) {
    throw new Error(`Deposit basis points must be between 1 and 9999, got ${depositBps}`);
  }
  const depositMinor = Math.floor((total.minor * depositBps) / 10_000);
  return {
    deposit: { currency: total.currency, minor: depositMinor },
    balance: { currency: total.currency, minor: total.minor - depositMinor },
  };
}

export function bpsOf(amount: Money, bps: number): Money {
  return { currency: amount.currency, minor: Math.floor((amount.minor * bps) / 10_000) };
}
