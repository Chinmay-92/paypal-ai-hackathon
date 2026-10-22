import { ForbiddenError } from "./errors";

export type MerchantActor = {
  kind: "merchant";
  tenantId: string;
  userId: string;
  role: "owner" | "fulfillment";
  name: string;
};

export type CustomerActor = {
  kind: "customer";
  tenantId: string;
  jobId: string;
  customerId: string;
  invitationId: string;
};

/** Background work and verified provider events. Never derived from a request. */
export type SystemActor = { kind: "system"; tenantId: string; reason: string };

export type Actor = MerchantActor | CustomerActor | SystemActor;

export function requireOwner(actor: MerchantActor): MerchantActor {
  if (actor.role !== "owner") throw new ForbiddenError("Only the business owner or coordinator can do this");
  return actor;
}

export function requireCustomerForJob(actor: CustomerActor, jobId: string): CustomerActor {
  if (actor.jobId !== jobId) throw new ForbiddenError("This review link does not cover that job");
  return actor;
}

export function auditActor(actor: Actor): { actorType: "merchant" | "customer" | "system"; actorId: string } {
  switch (actor.kind) {
    case "merchant":
      return { actorType: "merchant", actorId: actor.userId };
    case "customer":
      return { actorType: "customer", actorId: actor.customerId };
    case "system":
      return { actorType: "system", actorId: actor.reason };
  }
}
