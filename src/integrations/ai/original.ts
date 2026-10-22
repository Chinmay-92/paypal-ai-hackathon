import type { Domain, ScopeValue } from "@/domain/templates";
import type { ExtractionInput, Proposal, ProposedChange } from "./contract";

// Deterministic extraction of an ORIGINAL agreement from a pasted quote or
// thread. Like every extractor here, it only proposes cited values.

type Draft = Omit<ProposedChange, "supported" | "issue">;

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20, fifty: 50 };

function num(word: string): number | null {
  return /^\d+$/.test(word) ? Number(word) : (WORDS[word.toLowerCase()] ?? null);
}

/** ISO date or "November 30, 2026" / "30 November 2026". Returns YYYY-MM-DD and the literal span. */
function findDate(text: string): { value: string; span: string } | null {
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) return { value: iso[0], span: iso[0] };
  const md = new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`, "i").exec(text);
  const dm = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join("|")}),?\\s+(20\\d{2})\\b`, "i").exec(text);
  const m = md ? { month: md[1], day: md[2], year: md[3], span: md[0] } : dm ? { month: dm[2], day: dm[1], year: dm[3], span: dm[0] } : null;
  if (!m) return null;
  const mm = String(MONTHS.indexOf(m.month.toLowerCase()) + 1).padStart(2, "0");
  return { value: `${m.year}-${mm}-${m.day.padStart(2, "0")}`, span: m.span };
}

function sizesNear(text: string, garment: RegExp): { value: Record<string, number>; span: string } | null {
  // e.g. "50 shirts (S 10, M 20, L 15, XL 5)" or "hoodies: M x5, L x5"
  const block = new RegExp(`${garment.source}[^.\\n]{0,80}`, "i").exec(text);
  if (!block) return null;
  const sizes: Record<string, number> = {};
  for (const m of block[0].matchAll(/\b(XS|S|M|L|XL|XXL)\b\s*[:x×-]?\s*(\d{1,4})\b|\b(\d{1,4})\s*(?:x\s*)?(XS|S|M|L|XL|XXL)\b/g)) {
    const size = (m[1] ?? m[4]).toUpperCase();
    const n = Number(m[2] ?? m[3]);
    if (["S", "M", "L", "XL"].includes(size)) sizes[size] = (sizes[size] ?? 0) + n;
  }
  return Object.keys(sizes).length ? { value: sizes, span: block[0].trim() } : null;
}

export function baselineOriginal(input: ExtractionInput): Omit<Proposal, "proposedChanges"> & { proposedChanges: Draft[] } {
  const source = input.sources[input.sources.length - 1];
  const text = source.body;
  const changes: Draft[] = [];
  const missing: string[] = [];
  const add = (field: string, value: ScopeValue, span: string) => {
    if (!changes.some((c) => c.field === field)) changes.push({ field, oldValue: null, proposedValue: value, sourceId: source.id, quotedSpan: span });
  };
  const domain: Domain = input.domain;

  if (domain === "apparel") {
    // A count, then up to two descriptive words ("50 black printed t-shirts").
    const COUNT = `(\\d+|${Object.keys(WORDS).join("|")})`;
    const shirts = new RegExp(`\\b${COUNT}\\s+(?:[a-z-]+\\s+){0,2}?(?:t-?shirts|tees|shirts)\\b`, "i").exec(text);
    const hoodies = new RegExp(`\\b${COUNT}\\s+(?:[a-z-]+\\s+){0,2}?hoodies\\b`, "i").exec(text);
    const noHoodies = /\bno\s+hoodies\b/i.exec(text);
    if (shirts) add("shirts_qty", num(shirts[1]), shirts[0]);
    else missing.push("How many T-shirts?");
    if (hoodies) add("hoodies_qty", num(hoodies[1]), hoodies[0]);
    else if (noHoodies) add("hoodies_qty", 0, noHoodies[0]);
    else if (!/hood/i.test(text) && shirts) add("hoodies_qty", 0, shirts[0]);
    const ss = sizesNear(text, /(?:t-?shirts|tees|shirts)/);
    if (ss) add("shirts_sizes", ss.value, ss.span);
    const hs = sizesNear(text, /hoodies/);
    if (hs) add("hoodies_sizes", hs.value, hs.span);
    const color = /\b(black|white|navy|grey|gray|red|blue|green|heather grey)\b(?=[^.]{0,30}\b(?:shirts?|tees|garments?|hoodies)\b)/i.exec(text);
    if (color) add("garment_color", color[1][0].toUpperCase() + color[1].slice(1).toLowerCase(), color[0]);
    for (const a of input.catalog.artwork) {
      if (text.includes(a.id)) {
        add("artwork", a.id, a.id);
        break;
      }
    }
    if (!changes.some((c) => c.field === "artwork")) missing.push("Which artwork file was approved?");
    const date = findDate(text);
    if (date) add("delivery_date", date.value, date.span);
    else missing.push("What delivery date was agreed?");
  } else {
    const pages = /\b(\d+|\w+)[- ]pages?\b/i.exec(text);
    if (pages && num(pages[1]) !== null) add("pages", num(pages[1]), pages[0]);
    const rounds = /\b(\d+|\w+)\s+(?:rounds? of revisions?|revision rounds?)\b/i.exec(text);
    if (rounds && num(rounds[1]) !== null) add("revision_rounds", num(rounds[1]), rounds[0]);
    const noBooking = /\b(?:no|without|excluding|not including)\s+(?:appointment\s+)?booking\b|\bbooking\b[^.]{0,30}\b(?:not included|excluded|out of scope)\b/i.exec(text);
    const booking = /\b(?:with|including|includes?)\s+(?:appointment\s+)?booking\b/i.exec(text);
    if (noBooking) add("booking_included", false, noBooking[0]);
    else if (booking) {
      add("booking_included", true, booking[0]);
      missing.push("What booking provider and booking rules are required?");
    }
    const excl = /\b(?:excludes?|excluding|not included:?)\s+([^.\n]+)/i.exec(text);
    if (excl) add("exclusions", excl[1].trim(), excl[0]);
    const date = findDate(text);
    if (date) add("target_date", date.value, date.span);
    else missing.push("What launch date was agreed?");
  }

  return {
    baseRevisionId: input.baseRevisionId,
    intent: changes.length ? "change_request" : "uncertain",
    proposedChanges: changes,
    missingInformation: missing,
    affectedApprovals: [],
    rationale: changes.length ? "Terms found in the pasted text. Review every field; prices come from your rate card." : "No agreed terms were found in the pasted text.",
    draftReply: "",
  };
}
