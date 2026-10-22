// Domain templates: the only part of the engine that differs between custom
// goods and project services. Revision, approval and payment rules are shared.

export type Domain = "apparel" | "website";
export const DOMAINS: readonly Domain[] = ["apparel", "website"];

export type FieldType = "int" | "bool" | "text" | "date" | "catalog" | "sizes";

export type FieldDef = {
  path: string;
  label: string;
  type: FieldType;
  /** For catalog fields: which merchant catalog kind supplies the allowed IDs. */
  catalog?: "artwork";
  /** For sizes fields: allowed size keys. */
  sizes?: readonly string[];
  /** For sizes fields: the quantity field the breakdown must add up to. */
  quantityField?: string;
  help?: string;
  /** Text fields that hold sentences rather than a short value. */
  multiline?: boolean;
};

export type Sizes = Record<string, number>;
export type ScopeValue = number | boolean | string | Sizes | null;
export type Scope = Record<string, ScopeValue>;

export type RateCardEntry = { code: string; description: string; unitPriceMinor: number };
export type CatalogEntry = { id: string; label: string };
export type LineItem = { code: string; description: string; quantity: number; unitPriceMinor: number };

export type Template = {
  domain: Domain;
  label: string;
  /** PayPal shipping handling: physical goods collect an address, services do not. */
  physicalGoods: boolean;
  fields: readonly FieldDef[];
  defaultRateCard: readonly RateCardEntry[];
  defaultCatalog: { artwork: readonly CatalogEntry[] };
  /** Deterministic rate-card suggestion. The merchant may change any price before publishing. */
  suggestLineItems(scope: Scope, rateCard: readonly RateCardEntry[]): LineItem[];
  /** Business-rule problems that must be resolved before a revision can be published. */
  unresolved(scope: Scope): string[];
};

const APPAREL_SIZES = ["S", "M", "L", "XL"] as const;
const SIZE_ORDER: readonly string[] = ["XS", ...APPAREL_SIZES, "XXL"];

function rate(card: readonly RateCardEntry[], code: string): RateCardEntry {
  const entry = card.find((r) => r.code === code);
  if (!entry) throw new Error(`Rate card has no ${code}`);
  return entry;
}

function line(card: readonly RateCardEntry[], code: string, quantity: number): LineItem[] {
  if (quantity <= 0) return [];
  const r = rate(card, code);
  return [{ code, description: r.description, quantity, unitPriceMinor: r.unitPriceMinor }];
}

function sumSizes(value: ScopeValue): number | null {
  if (value === null || typeof value !== "object") return null;
  return Object.values(value).reduce((a, b) => a + b, 0);
}

const apparel: Template = {
  domain: "apparel",
  label: "Custom apparel",
  physicalGoods: true,
  fields: [
    { path: "shirts_qty", label: "T-shirts", type: "int" },
    { path: "shirts_sizes", label: "T-shirt sizes", type: "sizes", sizes: APPAREL_SIZES, quantityField: "shirts_qty" },
    { path: "hoodies_qty", label: "Hoodies", type: "int" },
    { path: "hoodies_sizes", label: "Hoodie sizes", type: "sizes", sizes: APPAREL_SIZES, quantityField: "hoodies_qty" },
    { path: "garment_color", label: "Garment colour", type: "text" },
    { path: "artwork", label: "Artwork", type: "catalog", catalog: "artwork", help: "Approved artwork asset" },
    { path: "delivery_date", label: "Delivery date", type: "date" },
  ],
  defaultRateCard: [
    { code: "SHIRT", description: "Printed T-shirt", unitPriceMinor: 1200 },
    { code: "HOODIE", description: "Printed hoodie", unitPriceMinor: 3200 },
  ],
  defaultCatalog: {
    artwork: [
      { id: "logo-v1", label: "Logo v1 (synthetic)" },
      { id: "logo-v2", label: "Logo v2 (synthetic)" },
    ],
  },
  suggestLineItems(scope, card) {
    return [...line(card, "SHIRT", Number(scope.shirts_qty ?? 0)), ...line(card, "HOODIE", Number(scope.hoodies_qty ?? 0))];
  },
  unresolved(scope) {
    const problems: string[] = [];
    for (const [qtyKey, sizeKey, label] of [
      ["shirts_qty", "shirts_sizes", "T-shirt"],
      ["hoodies_qty", "hoodies_sizes", "hoodie"],
    ] as const) {
      const qty = scope[qtyKey];
      if (qty === null || qty === undefined) {
        problems.push(`${label} quantity is unresolved`);
        continue;
      }
      const sized = sumSizes(scope[sizeKey] ?? null);
      if (Number(qty) > 0 && sized === null) problems.push(`Which ${label} sizes are required?`);
      else if (sized !== null && sized !== Number(qty)) {
        problems.push(`${label} sizes add up to ${sized}, but the quantity is ${qty}`);
      }
    }
    if (!scope.artwork) problems.push("Artwork is unresolved");
    if (!scope.delivery_date) problems.push("Delivery date is unresolved");
    return problems;
  },
};

const website: Template = {
  domain: "website",
  label: "Website project",
  physicalGoods: false,
  fields: [
    { path: "pages", label: "Pages", type: "int" },
    { path: "booking_included", label: "Appointment booking included", type: "bool" },
    { path: "booking_provider", label: "Booking provider and rules", type: "text" },
    { path: "revision_rounds", label: "Revision rounds", type: "int" },
    { path: "exclusions", label: "Exclusions", type: "text", multiline: true },
    { path: "acceptance", label: "Acceptance conditions", type: "text", multiline: true },
    { path: "target_date", label: "Target launch date", type: "date" },
  ],
  defaultRateCard: [
    { code: "WEBSITE_BASE", description: "Website design and build (up to 5 pages, 2 revision rounds)", unitPriceMinor: 120000 },
    { code: "EXTRA_PAGE", description: "Additional page", unitPriceMinor: 15000 },
    { code: "BOOKING", description: "Appointment booking integration", unitPriceMinor: 60000 },
    { code: "EXTRA_ROUND", description: "Additional revision round", unitPriceMinor: 10000 },
  ],
  defaultCatalog: { artwork: [] },
  suggestLineItems(scope, card) {
    const pages = Number(scope.pages ?? 0);
    const rounds = Number(scope.revision_rounds ?? 0);
    return [
      ...line(card, "WEBSITE_BASE", 1),
      ...line(card, "EXTRA_PAGE", Math.max(0, pages - 5)),
      ...line(card, "BOOKING", scope.booking_included === true ? 1 : 0),
      ...line(card, "EXTRA_ROUND", Math.max(0, rounds - 2)),
    ];
  },
  unresolved(scope) {
    const problems: string[] = [];
    if (scope.pages === null || Number(scope.pages) < 1) problems.push("Number of pages is unresolved");
    if (scope.revision_rounds === null) problems.push("Revision rounds are unresolved");
    if (scope.booking_included === null) problems.push("Is appointment booking included?");
    if (scope.booking_included === true && !scope.booking_provider) {
      problems.push("What booking provider and booking rules are required?");
    }
    if (!scope.target_date) problems.push("Target launch date is unresolved");
    return problems;
  },
};

export const TEMPLATES: Record<Domain, Template> = { apparel, website };

export function template(domain: Domain): Template {
  const t = TEMPLATES[domain];
  if (!t) throw new Error(`Unknown domain ${domain}`);
  return t;
}

export function fieldDef(domain: Domain, path: string): FieldDef | undefined {
  return template(domain).fields.find((f) => f.path === path);
}

/** Validates a single value against its field type. Returns an error message or null. */
export function checkFieldValue(def: FieldDef, value: ScopeValue, catalog: { artwork: readonly CatalogEntry[] }): string | null {
  if (value === null) return null; // explicit "unresolved" is always representable
  switch (def.type) {
    case "int":
      return Number.isSafeInteger(value) && (value as number) >= 0 ? null : `${def.label} must be a whole number`;
    case "bool":
      return typeof value === "boolean" ? null : `${def.label} must be yes or no`;
    case "text":
      return typeof value === "string" && value.length <= 2000 ? null : `${def.label} must be text`;
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
        ? null
        : `${def.label} must be a YYYY-MM-DD date`;
    case "catalog": {
      const options = catalog[def.catalog ?? "artwork"];
      return typeof value === "string" && options.some((o) => o.id === value) ? null : `${def.label} must be a catalog item`;
    }
    case "sizes": {
      if (typeof value !== "object" || Array.isArray(value)) return `${def.label} must be a size breakdown`;
      for (const [k, v] of Object.entries(value)) {
        if (!def.sizes?.includes(k)) return `${def.label} has unknown size ${k}`;
        if (!Number.isSafeInteger(v) || v < 0) return `${def.label} ${k} must be a whole number`;
      }
      return null;
    }
  }
}

/** Human-readable value. Pass catalog labels so artwork IDs display as names. */
export function formatScopeValue(value: ScopeValue | undefined, labels?: Record<string, string>): string {
  if (value === null || value === undefined) return "Unresolved";
  if (typeof value === "string" && labels?.[value]) return labels[value];
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    // JSONB does not keep key order; show sizes in garment order.
    const rank = (k: string) => (SIZE_ORDER.indexOf(k) + 1 || 99);
    const parts = Object.entries(value)
      .filter(([, n]) => n > 0)
      .sort(([a], [b]) => rank(a) - rank(b));
    return parts.length ? parts.map(([k, n]) => `${k} ${n}`).join(", ") : "None";
  }
  return String(value);
}
