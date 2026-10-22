import { z } from "zod";

const minor = z.number().int().min(0).max(100_000_000);

export const ScopeValueSchema = z.union([
  z.number().int().min(0).max(1_000_000),
  z.boolean(),
  z.string().max(2000),
  z.record(z.string().max(8), z.number().int().min(0).max(1_000_000)),
  z.null(),
]);

export const ScopeSchema = z.record(z.string().max(64), ScopeValueSchema);

export const LineItemSchema = z.object({
  code: z.string().min(1).max(40),
  description: z.string().min(1).max(200),
  quantity: z.number().int().min(1).max(1_000_000),
  unitPriceMinor: minor,
});

export const CreateJobInput = z.object({
  domain: z.enum(["apparel", "website"]),
  title: z.string().trim().min(1).max(120),
  customer: z.object({ name: z.string().trim().min(1).max(120), email: z.email().max(200) }),
  scope: ScopeSchema,
  lineItems: z.array(LineItemSchema).min(1).max(50),
  depositBps: z.number().int().min(0).max(10_000),
  merchantNote: z.string().max(1000).optional(),
});

export const AddMessageInput = z.object({
  authorLabel: z.string().trim().min(1).max(120),
  authorRole: z.enum(["customer", "merchant"]),
  sentAtLabel: z.string().trim().max(60).optional(),
  body: z.string().trim().min(1).max(8000),
});

export const PortalMessageInput = z.object({ body: z.string().trim().min(1).max(4000) });

export const ReviewChangeInput = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("accept"),
    expectedVersion: z.number().int(),
    scope: ScopeSchema,
    lineItems: z.array(LineItemSchema).min(1).max(50),
    depositBps: z.number().int().min(0).max(10_000),
    merchantNote: z.string().max(1000).optional(),
    /** Required when work has already started: the merchant confirms the change is feasible. */
    confirmFeasibility: z.boolean().optional(),
  }),
  z.object({ decision: z.literal("reject"), expectedVersion: z.number().int(), note: z.string().trim().min(3).max(1000) }),
  z.object({ decision: z.literal("reopen"), expectedVersion: z.number().int(), note: z.string().trim().min(3).max(1000) }),
]);

export const ManualRevisionInput = z.object({
  expectedVersion: z.number().int(),
  scope: ScopeSchema,
  lineItems: z.array(LineItemSchema).min(1).max(50),
  depositBps: z.number().int().min(0).max(10_000),
  merchantNote: z.string().max(1000).optional(),
  confirmFeasibility: z.boolean().optional(),
});

export const VersionInput = z.object({ expectedVersion: z.number().int() });

export const DecisionInput = z.object({
  action: z.enum(["APPROVE", "DECLINE"]),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  reason: z.string().trim().max(1000).optional(),
});

export const HoldInput = z.object({ expectedVersion: z.number().int(), reason: z.string().trim().min(3).max(500) });

export const RefundInput = z.object({
  amountMinor: z.number().int().min(1).max(100_000_000),
  reason: z.string().trim().min(3).max(255),
  /** Client-generated once per refund form so a retried submit cannot refund twice. */
  operationKey: z.uuid(),
});

export const ResolveCaptureInput = z.object({
  resolution: z.enum(["credit_to_current", "refund_review"]),
  note: z.string().trim().min(3).max(500),
});

export const LoginInput = z.object({ email: z.email(), password: z.string().min(1).max(200) });
