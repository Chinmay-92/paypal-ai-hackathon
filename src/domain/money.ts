// Money is always integer minor units plus an explicit currency. PayPal takes
// decimal strings; conversion happens only at the provider boundary.

export type Currency = "USD";
export const SUPPORTED_CURRENCIES: readonly Currency[] = ["USD"];

export type Money = { currency: Currency; minor: number };

const MINOR_DIGITS: Record<Currency, number> = { USD: 2 };

export function assertMinor(minor: number, label = "amount"): number {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new RangeError(`Invalid ${label}: ${minor}`);
  return minor;
}

export function toDecimalString(money: Money): string {
  assertMinor(money.minor);
  const digits = MINOR_DIGITS[money.currency];
  const s = String(money.minor).padStart(digits + 1, "0");
  return `${s.slice(0, -digits)}.${s.slice(-digits)}`;
}

export function parseDecimalString(value: string, currency: Currency): Money {
  const digits = MINOR_DIGITS[currency];
  if (!new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`).test(value)) throw new RangeError(`Invalid ${currency} amount: ${value}`);
  const [whole, frac = ""] = value.split(".");
  const minor = Number(whole) * 10 ** digits + Number(frac.padEnd(digits, "0"));
  return { currency, minor: assertMinor(minor) };
}

export function formatMoney(money: Money): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: money.currency }).format(
    assertMinor(money.minor) / 10 ** MINOR_DIGITS[money.currency],
  );
}

/**
 * Deposit rounding policy: half-up to the nearest minor unit.
 * target = floor((total * bps + 5000) / 10000). Integer arithmetic only.
 */
export function depositTarget(totalMinor: number, depositBps: number): number {
  assertMinor(totalMinor, "total");
  if (!Number.isInteger(depositBps) || depositBps < 0 || depositBps > 10_000) {
    throw new RangeError(`Deposit basis points must be 0..10000, got ${depositBps}`);
  }
  return Math.floor((totalMinor * depositBps + 5000) / 10_000);
}
