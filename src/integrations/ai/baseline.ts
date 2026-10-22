import { formatScopeValue } from "@/domain/revision";
import type { ScopeValue } from "@/domain/templates";
import type { ExtractionInput, Intent, Proposal, ProposedChange } from "./contract";

// Deterministic keyword/field-diff baseline. It is the comparison point for
// model evaluation and the fallback when the model is unavailable. Like the
// model, it only proposes; merchant review decides.

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, a: 1, an: 1,
};

function toNumber(word: string): number | null {
  if (/^\d+$/.test(word)) return Number(word);
  return NUMBER_WORDS[word.toLowerCase()] ?? null;
}

const QUESTION_START = /^(would|could|can|is|are|does|do|how|what|when|will|should|may)\b/i;
const INJECTION = /(ignore|disregard)\s+(all\s+|your\s+|previous\s+|the\s+|any\s+)*(rules|instructions)|mark\s+(this|the|my)?\s*(order|job|invoice)?\s*(as\s+)?paid|system prompt/i;

type Draft = Omit<ProposedChange, "supported" | "issue">;

/** Literal span helper: returns the exact substring of body matched case-insensitively. */
function span(body: string, re: RegExp): { text: string; groups: string[] } | null {
  const m = re.exec(body);
  return m ? { text: m[0], groups: m.slice(1) } : null;
}

export function baselineExtract(input: ExtractionInput): Omit<Proposal, "proposedChanges"> & { proposedChanges: Draft[] } {
  const source = input.sources[input.sources.length - 1];
  const full = source.body.trim();
  // Contradictions: the last "actually" clause wins, but the whole message stays cited.
  const actuallyAt = full.toLowerCase().lastIndexOf("actually");
  const segment = actuallyAt >= 0 ? full.slice(actuallyAt) : full;
  const scope = input.scope;
  const changes: Draft[] = [];
  const missing: string[] = [];
  const change = (field: string, proposedValue: ScopeValue, quotedSpan: string) =>
    changes.push({ field, oldValue: scope[field] ?? null, proposedValue, sourceId: source.id, quotedSpan });

  const result = (intent: Intent, rationale: string, draftReply = ""): ReturnType<typeof baselineExtract> => ({
    baseRevisionId: input.baseRevisionId,
    intent,
    proposedChanges: changes,
    missingInformation: missing,
    affectedApprovals: changes.length ? ["Customer approval of the current revision"] : [],
    rationale,
    draftReply,
  });

  if (INJECTION.test(full)) {
    return result("irrelevant", "The message contains instructions addressed to the system. It was treated as untrusted data and changes nothing.");
  }
  if (/\bcancel\b/i.test(segment)) {
    missing.push("Confirm cancellation terms and any costs already incurred with the customer.");
    return result("cancellation", "The customer asks to cancel. The merchant decides cancellation consequences.");
  }
  const isQuestion = segment.trim().endsWith("?") && QUESTION_START.test(segment.trim());
  if (isQuestion) {
    return result("question", "This is a question. The agreement has not changed.", "Thanks for asking. I'll check and get back to you; your order has not changed.");
  }

  if (input.domain === "apparel") {
    const sub = span(segment, /\b(\d+|\w+)\s+(?:of\s+(?:those|them|these|the\s+shirts)\s+)?hoodies\s+instead\b/i);
    const add = span(segment, /\badd\s+(\d+|\w+)\s+hoodies\b/i);
    const shirts = span(segment, /\b(?:make\s+it|change\s+(?:it\s+)?to|reduce\s+(?:it\s+)?to|only)\s+(\d+|\w+)\s+(?:t-?)?shirts\b/i);
    if (sub) {
      const n = toNumber(sub.groups[0]);
      if (n !== null) {
        change("shirts_qty", Number(scope.shirts_qty ?? 0) - n, sub.text);
        change("hoodies_qty", Number(scope.hoodies_qty ?? 0) + n, sub.text);
        change("shirts_sizes", null, sub.text);
        change("hoodies_sizes", null, sub.text);
        missing.push(`Which ${n} sizes move to hoodies?`);
      }
    } else if (add) {
      const n = toNumber(add.groups[0]);
      if (n !== null) {
        change("hoodies_qty", Number(scope.hoodies_qty ?? 0) + n, add.text);
        change("hoodies_sizes", null, add.text);
        missing.push(`Which sizes are the ${n} hoodies?`);
      }
    } else if (shirts) {
      const n = toNumber(shirts.groups[0]);
      if (n !== null) {
        change("shirts_qty", n, shirts.text);
        change("shirts_sizes", null, shirts.text);
        missing.push("What is the new T-shirt size breakdown?");
      }
    }
    const art = span(segment, /\b(?:use|change|replace|swap|new)\b[^.;]*\b(?:logo|artwork|design)\b[^.;]*/i);
    if (art) {
      change("artwork", null, art.text);
      missing.push(`Which artwork asset replaces ${formatScopeValue(scope.artwork ?? null)}? Attach or select the file.`);
    }
  } else {
    const booking = span(segment, /\b(?:add|include)\s+(?:an?\s+)?(?:appointment\s+)?booking\b/i);
    if (booking && scope.booking_included !== true) {
      change("booking_included", true, booking.text);
      change("booking_provider", null, booking.text);
      missing.push("What booking provider and booking rules are required?", "Does the target launch date change?");
    }
    const pages = span(segment, /\b(\d+|\w+)\s+(?:more|extra|additional)\s+pages?\b/i) ?? span(segment, /\badd\s+(an?|one)\s+(?:\w+\s+)?page\b/i);
    if (pages) {
      const n = toNumber(pages.groups[0]);
      if (n !== null) change("pages", Number(scope.pages ?? 0) + n, pages.text);
    }
  }

  const priceClaim = span(full, /[^.]*\b(free|no charge|no extra cost|promised|discount)\b[^.]*/i);
  if (priceClaim) missing.push(`The customer states a price commitment ("${priceClaim.text.trim()}"). The merchant decides pricing.`);

  if (changes.length) {
    return result(
      "change_request",
      "The message asks to change the agreed scope. Quantities and items are proposed from the quoted text; prices are set by the merchant.",
      missing.length ? `Thanks. Before we update the order: ${missing.filter((m) => m.endsWith("?")).join(" ")}`.trim() : "",
    );
  }
  if (/\b(looks good|go ahead|sounds good|approved?|all good|perfect|confirmed)\b/i.test(segment)) {
    return result("approval_like", "Approval-like wording in a message is not an approval. Approval happens only on the review page.");
  }
  if (/\b(use|change|swap|switch|make|replace|add|remove)\b/i.test(segment)) {
    missing.push("Which item does the customer mean?");
    return result("uncertain", "The message asks for a change but does not say clearly what should change.", "Thanks. Could you tell us exactly which item you mean?");
  }
  if (segment.trim().endsWith("?")) return result("question", "This is a question. The agreement has not changed.");
  return result("irrelevant", "No change, question or approval was found.");
}
